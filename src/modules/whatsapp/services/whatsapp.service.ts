import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import { client } from '../../../config/whatsapp/client.js';
import { WhatsappCommandsService } from './whatsapp-commands.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { MailService } from '../../mail/mail.service.js';

const READY_TIMEOUT_MS = 90_000;
const MAX_RESTART_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 5_000;
const DIAGNOSTICS_INTERVAL_MS = 15_000;
// Depois do `ready`, confere o estado da conexão de tempos em tempos: um
// Chrome que morre ou uma página travada não emitem `disconnected`.
const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HEALTH_CHECK_TIMEOUT_MS = 15_000;
// OPENING/TIMEOUT aparecem por alguns segundos quando o celular oscila; só
// alerta se o estado ruim persistir por esse número de checagens seguidas.
const HEALTH_CHECK_MAX_FAILURES = 3;
// Espera entre derrubar o cliente caído e subir de novo.
const RECOVER_BACKOFF_MS = 10_000;
// Se a reconexão inteira falhar, tenta outra vez depois desse intervalo.
const RECOVER_RETRY_MS = 5 * 60_000;
// Um Chrome travado pode não responder nem ao close(); passado esse prazo,
// o processo é morto na marra.
const DESTROY_TIMEOUT_MS = 15_000;
// Locks que um Chrome morto deixa no perfil e que impedem o próximo de abrir.
const CHROME_LOCK_FILES = [
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
];

/** Minimal shape of the puppeteer page whatsapp-web.js keeps internally. */
type PupPage = {
  evaluate(expression: string): Promise<unknown>;
  on(event: 'pageerror', handler: (err: unknown) => void): void;
};

/** whatsapp-web.js internals used to tear down a dead browser. */
type ClientInternals = {
  pupBrowser?: { process(): ChildProcess | null };
  authStrategy?: { userDataDir?: string };
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
    private readonly mailService: MailService,
    @InjectPinoLogger(WhatsappService.name)
    private readonly logger: PinoLogger,
  ) {}

  private diagnosticsTimer?: NodeJS.Timeout;
  private instrumentedPage?: PupPage;
  private healthTimer?: NodeJS.Timeout;
  private healthFailures = 0;
  private wasReady = false;
  private downAlerted = false;
  private shuttingDown = false;
  private recovering = false;
  private retryTimer?: NodeJS.Timeout;

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
      // No boot o QR é esperado; depois de já ter conectado, é sessão perdida.
      if (this.wasReady) {
        this.alertDown('A sessão caiu e o WhatsApp está pedindo um QR novo.');
      }
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
      this.wasReady = true;
      this.markUp();
      this.startHealthCheck();
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
      this.alertDown(`Evento "disconnected" do cliente: ${String(reason)}.`);
      // A lib já fecha o Chrome depois de emitir `disconnected`; sem subir de
      // novo, o bot fica fora até alguém reiniciar o container.
      void this.recover(`disconnected: ${String(reason)}`);
    });

    client.on('auth_failure', (message) => {
      this.log.error('auth_failure', 'Falha de autenticação do cliente', {
        reason: String(message),
      });
      this.alertDown(`Falha de autenticação: ${String(message)}.`);
    });

    this.whatsappCommandsService.execute(client);

    void this.connect();
  }

  async onModuleDestroy() {
    this.log.info('shutdown.start', 'Encerrando cliente');
    this.shuttingDown = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.stopHealthCheck();
    this.stopPageDiagnostics();
    await this.safeDestroy();
    this.log.info('shutdown.done', 'Cliente encerrado');
  }

  /**
   * Sobe o cliente; se nem o watchdog conseguir, agenda uma reconexão em vez
   * de deixar o bot parado.
   */
  private async connect() {
    let ready = false;
    try {
      ready = await this.initializeWithWatchdog();
    } catch (err: unknown) {
      this.log.error('watchdog.crashed', 'Watchdog de inicialização abortou', {
        err,
      });
    }
    if (ready || this.shuttingDown) return;

    this.log.warn('recover.scheduled', 'Nova reconexão agendada', {
      inMs: RECOVER_RETRY_MS,
    });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.recover('inicialização não chegou ao ready');
    }, RECOVER_RETRY_MS);
  }

  /**
   * Derruba o que sobrou do cliente e sobe de novo. Quando o Chrome morre ou
   * trava, o processo Node segue vivo, então o `restart` do compose não age.
   */
  private async recover(cause: string) {
    if (this.shuttingDown || this.recovering) return;
    this.recovering = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.stopHealthCheck();
    this.stopPageDiagnostics();
    this.log.warn('recover.start', 'Reiniciando cliente após queda', { cause });

    try {
      await this.safeDestroy();
      await this.removeChromeLocks();
      await new Promise((r) => setTimeout(r, RECOVER_BACKOFF_MS));
      if (!this.shuttingDown) await this.connect();
    } finally {
      this.recovering = false;
    }
  }

  private async initializeWithWatchdog(): Promise<boolean> {
    const watchdogLog = this.log.timed();

    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      const outcome = await this.tryInitialize(READY_TIMEOUT_MS);
      if (outcome === 'ready') {
        watchdogLog.info('init.done', 'Cliente inicializado', { attempt });
        return true;
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
    this.alertDown(
      `O cliente não ficou pronto em ${MAX_RESTART_ATTEMPTS} tentativas de ${READY_TIMEOUT_MS / 1000}s; segue esperando sem prazo.`,
    );

    return (await this.tryInitialize(null)) === 'ready';
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

  private startHealthCheck() {
    if (this.healthTimer) return;
    this.healthFailures = 0;
    this.healthTimer = setInterval(
      () => void this.checkHealth(),
      HEALTH_CHECK_INTERVAL_MS,
    );
  }

  private stopHealthCheck() {
    if (!this.healthTimer) return;
    clearInterval(this.healthTimer);
    this.healthTimer = undefined;
  }

  private async checkHealth() {
    let state: string;
    try {
      state = String(
        await Promise.race([
          client.getState(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('getState() não respondeu')),
              HEALTH_CHECK_TIMEOUT_MS,
            ),
          ),
        ]),
      );
    } catch (err: unknown) {
      state = `erro: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (state === 'CONNECTED') {
      this.healthFailures = 0;
      this.markUp();
      return;
    }

    this.healthFailures++;
    this.log.warn('health.unhealthy', 'Cliente fora do estado CONNECTED', {
      state,
      failures: this.healthFailures,
      maxFailures: HEALTH_CHECK_MAX_FAILURES,
    });

    if (this.healthFailures >= HEALTH_CHECK_MAX_FAILURES) {
      const minutes =
        (HEALTH_CHECK_MAX_FAILURES * HEALTH_CHECK_INTERVAL_MS) / 60_000;
      this.alertDown(`Estado da conexão há ~${minutes} min: ${state}.`);
      void this.recover(`health check: ${state}`);
    }
  }

  /** Manda o email de queda, uma vez por queda (até o cliente voltar). */
  private alertDown(reason: string) {
    if (this.shuttingDown || this.downAlerted) return;
    this.downAlerted = true;
    this.log.warn('alert.down', 'Enviando alerta de WhatsApp desconectado', {
      reason,
    });
    void this.mailService.sendAlert(
      '[job_seeker] WhatsApp desconectado',
      [
        'O WhatsApp do bot caiu.',
        '',
        `Motivo: ${reason}`,
        `Quando: ${formatNow()}`,
        `Host: ${hostname()}`,
        '',
        'Se precisar de QR novo: docker compose logs -f app',
      ].join('\n'),
    );
  }

  /** Rearma o alerta e avisa que voltou, se tinha avisado da queda. */
  private markUp() {
    if (!this.downAlerted) return;
    this.downAlerted = false;
    this.log.info('alert.up', 'WhatsApp reconectado após alerta de queda');
    void this.mailService.sendAlert(
      '[job_seeker] WhatsApp reconectado',
      `O WhatsApp do bot voltou a conectar em ${formatNow()} (${hostname()}).`,
    );
  }

  private async safeDestroy() {
    // Pega o processo antes: um Chrome travado pode não fechar com destroy().
    const chrome = (client as unknown as ClientInternals).pupBrowser?.process();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        client.destroy(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('destroy() não respondeu')),
            DESTROY_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err: unknown) {
      this.log.warn('destroy.failed', 'Falha ao destruir o cliente', { err });
      if (chrome && chrome.exitCode === null && !chrome.killed) {
        chrome.kill('SIGKILL');
        this.log.warn('destroy.killed', 'Processo do Chrome morto à força', {
          pid: chrome.pid,
        });
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Mesmo papel do `rm Singleton*` do CMD do Dockerfile, sem reiniciar o container. */
  private async removeChromeLocks() {
    const dir = (client as unknown as ClientInternals).authStrategy
      ?.userDataDir;
    if (!dir) return;
    await Promise.all(
      CHROME_LOCK_FILES.map((name) =>
        rm(join(dir, name), { force: true }).catch((err: unknown) =>
          this.log.warn(
            'recover.lock_failed',
            'Falha ao remover lock do Chrome',
            {
              name,
              err,
            },
          ),
        ),
      ),
    );
  }
}

function formatNow() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
