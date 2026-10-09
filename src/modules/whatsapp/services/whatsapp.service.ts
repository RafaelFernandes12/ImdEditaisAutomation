import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import qrcode from 'qrcode-terminal';
import { client } from '../../../config/whatsapp/client.js';
import { WhatsappCommandsService } from './whatsapp-commands.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

const READY_TIMEOUT_MS = 90_000;
const MAX_RESTART_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 5_000;
const DIAGNOSTICS_INTERVAL_MS = 15_000;

/** Minimal shape of the puppeteer page whatsapp-web.js keeps internally. */
type PupPage = {
  evaluate(expression: string): Promise<unknown>;
  on(event: 'pageerror', handler: (err: unknown) => void): void;
};

type InitOutcome = 'ready' | 'timeout' | 'failed';

type SyncProbe = {
  state?: string;
  stream?: string;
  hasSynced?: boolean;
  offline?: unknown;
  wwebjs?: boolean;
};

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly whatsappCommandsService: WhatsappCommandsService,
    @InjectPinoLogger(WhatsappService.name)
    private readonly logger: PinoLogger,
  ) {}

  private diagnosticsTimer?: NodeJS.Timeout;
  private instrumentedPage?: PupPage;

  private get log() {
    return new ScopedLogger(this.logger, 'wa');
  }

  onModuleInit() {
    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      this.log.info('qr.received', 'QR recebido, aguardando leitura', {
        qrLength: qr.length,
      });
      this.startPageDiagnostics();
    });

    client.on('authenticated', () => {
      this.log.info(
        'authenticated',
        'Cliente autenticado, aguardando sincronização',
      );
    });

    client.on('ready', () => {
      this.log.info('ready', 'Cliente pronto');
      this.stopPageDiagnostics();
    });

    client.on('loading_screen', (percent, message) => {
      this.log.info('loading_screen', 'Tela de carregamento do WhatsApp', {
        percent: Number(percent),
        message,
      });
      this.startPageDiagnostics();
    });

    client.on('change_state', (state) => {
      this.log.info('state_changed', 'Estado do cliente alterado', {
        state: String(state),
      });
    });

    client.on('disconnected', (reason) => {
      this.log.error('disconnected', 'Cliente desconectado', {
        reason: String(reason),
      });
    });

    client.on('auth_failure', (message) => {
      this.log.error('auth_failure', 'Falha de autenticação do cliente', {
        reason: String(message),
      });
    });

    this.whatsappCommandsService.execute(client);

    this.initializeWithWatchdog().catch((err: unknown) =>
      this.log.error('watchdog.crashed', 'Watchdog de inicialização abortou', {
        err,
      }),
    );
  }

  async onModuleDestroy() {
    this.log.info('shutdown.start', 'Encerrando cliente');
    this.stopPageDiagnostics();
    await this.safeDestroy();
    this.log.info('shutdown.done', 'Cliente encerrado');
  }

  private async initializeWithWatchdog() {
    const watchdogLog = this.log.timed();

    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      const outcome = await this.tryInitialize(READY_TIMEOUT_MS);
      if (outcome === 'ready') {
        watchdogLog.info('init.done', 'Cliente inicializado', { attempt });
        return;
      }

      const cause =
        outcome === 'timeout'
          ? `not ready within ${READY_TIMEOUT_MS}ms`
          : 'failed to launch';

      this.log.warn(
        'init.retry',
        'Reiniciando cliente após tentativa malsucedida',
        {
          attempt,
          maxAttempts: MAX_RESTART_ATTEMPTS,
          outcome,
          cause,
          timeoutMs: READY_TIMEOUT_MS,
        },
      );

      await this.safeDestroy();
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }

    watchdogLog.warn(
      'init.watchdog_exhausted',
      'Watchdog esgotado, aguardando cliente sem prazo',
      { maxAttempts: MAX_RESTART_ATTEMPTS },
    );

    await this.tryInitialize(null);
  }

  private tryInitialize(timeoutMs: number | null): Promise<InitOutcome> {
    return new Promise<InitOutcome>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const attemptLog = this.log.start(
        'init.start',
        'Inicializando cliente do WhatsApp',
        { timeoutMs },
      );

      const finish = (outcome: InitOutcome) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('ready', onReady);
        client.removeListener('qr', onQr);

        attemptLog.info(
          'init.attempt_finished',
          'Tentativa de inicialização concluída',
          { outcome },
        );

        resolve(outcome);
      };

      const onReady = () => {
        this.stopPageDiagnostics();
        finish('ready');
      };

      const onQr = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
          this.log.info(
            'init.watchdog_paused',
            'QR aguardando leitura, watchdog pausado',
          );
        }
      };

      client.once('ready', onReady);
      client.on('qr', onQr);

      if (timeoutMs !== null) {
        timer = setTimeout(() => finish('timeout'), timeoutMs);
      }

      client.initialize().catch((err: unknown) => {
        attemptLog.error('init.failed', 'client.initialize() falhou', { err });
        finish('failed');
      });
    });
  }

  private startPageDiagnostics() {
    if (this.diagnosticsTimer) return;

    const page = (client as unknown as { pupPage?: PupPage }).pupPage;
    if (!page) {
      this.log.debug(
        'diagnostics.no_page',
        'Sem página do puppeteer para instrumentar',
      );
      return;
    }

    if (this.instrumentedPage !== page) {
      page.on('pageerror', (err: unknown) => {
        this.log.error('page_error', 'Erro na página do WhatsApp Web', { err });
      });
      this.instrumentedPage = page;
    }

    this.log.debug('diagnostics.started', 'Sonda de sincronização iniciada', {
      intervalMs: DIAGNOSTICS_INTERVAL_MS,
    });

    this.diagnosticsTimer = setInterval(() => {
      page
        .evaluate(
          `(() => {
            try {
              const s = window.require('WAWebSocketModel').Socket;
              return JSON.stringify({
                state: s.state,
                stream: s.stream,
                hasSynced: s.hasSynced,
                offline: window.AuthStore?.OfflineMessageHandler?.getOfflineDeliveryProgress?.(),
                wwebjs: typeof window.WWebJS !== 'undefined',
              });
            } catch (e) {
              return 'probe failed: ' + String(e);
            }
          })()`,
        )
        .then((snapshot) => {
          const raw = String(snapshot);

          let probe: SyncProbe | undefined;
          try {
            probe = JSON.parse(raw) as SyncProbe;
          } catch {
            probe = undefined;
          }

          if (!probe) {
            this.log.warn(
              'sync_probe.unavailable',
              'Sonda de sincronização não retornou JSON',
              { raw },
            );
            return;
          }

          this.log.info('sync_probe', 'Sonda de sincronização', {
            state: probe.state,
            stream: probe.stream,
            hasSynced: probe.hasSynced,
            offline: probe.offline,
            wwebjs: probe.wwebjs,
          });
        })
        .catch((err: unknown) => {
          this.log.warn('sync_probe.failed', 'Sonda de sincronização falhou', {
            err,
          });
        });
    }, DIAGNOSTICS_INTERVAL_MS);
  }

  private stopPageDiagnostics() {
    if (!this.diagnosticsTimer) return;
    clearInterval(this.diagnosticsTimer);
    this.diagnosticsTimer = undefined;
    this.log.debug('diagnostics.stopped', 'Sonda de sincronização encerrada');
  }

  private async safeDestroy() {
    try {
      await client.destroy();
    } catch (err: unknown) {
      this.log.warn('destroy.failed', 'Falha ao destruir o cliente', { err });
    }
  }
}
