import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import qrcode from 'qrcode-terminal';
import { client } from '../../../config/whatsapp/client.js';
import { LoginService } from './login.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';
import { DeactiveUser } from './deactiveUser.js';
import { maskContact } from '../../../utils/log-redact.js';

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
    private loginService: LoginService,
    private getEditaisAndamento: GetEditaisAndamento,
    private userService: UserService,
    @InjectPinoLogger(WhatsappService.name)
    private readonly logger: PinoLogger,
    private readonly deactiveUser: DeactiveUser,
  ) {}

  private diagnosticsTimer?: NodeJS.Timeout;
  private instrumentedPage?: PupPage;

  onModuleInit() {
    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      this.logger.info(
        { evt: 'wa.qr.received', qrLength: qr.length },
        'QR recebido, aguardando leitura',
      );
      this.startPageDiagnostics();
    });

    client.on('authenticated', () => {
      this.logger.info(
        { evt: 'wa.authenticated' },
        'Cliente autenticado, aguardando sincronização',
      );
    });

    client.on('ready', () => {
      this.logger.info({ evt: 'wa.ready' }, 'Cliente pronto');
      this.stopPageDiagnostics();
    });

    client.on('loading_screen', (percent, message) => {
      this.logger.info(
        { evt: 'wa.loading_screen', percent: Number(percent), message },
        'Tela de carregamento do WhatsApp',
      );
      this.startPageDiagnostics();
    });

    client.on('change_state', (state) => {
      this.logger.info(
        { evt: 'wa.state_changed', state: String(state) },
        'Estado do cliente alterado',
      );
    });

    client.on('disconnected', (reason) => {
      this.logger.error(
        { evt: 'wa.disconnected', reason: String(reason) },
        'Cliente desconectado',
      );
    });

    client.on('auth_failure', (message) => {
      this.logger.error(
        { evt: 'wa.auth_failure', reason: String(message) },
        'Falha de autenticação do cliente',
      );
    });

    this.registerMessageHandler(client);

    this.initializeWithWatchdog().catch((err: unknown) =>
      this.logger.error(
        { evt: 'wa.watchdog.crashed', err },
        'Watchdog de inicialização abortou',
      ),
    );
  }

  async onModuleDestroy() {
    this.logger.info({ evt: 'wa.shutdown.start' }, 'Encerrando cliente');
    this.stopPageDiagnostics();
    await this.safeDestroy();
    this.logger.info({ evt: 'wa.shutdown.done' }, 'Cliente encerrado');
  }

  private async initializeWithWatchdog() {
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      const outcome = await this.tryInitialize(READY_TIMEOUT_MS);
      if (outcome === 'ready') {
        this.logger.info(
          {
            evt: 'wa.init.done',
            attempt,
            durationMs: Date.now() - startedAt,
          },
          'Cliente inicializado',
        );
        return;
      }

      const cause =
        outcome === 'timeout'
          ? `not ready within ${READY_TIMEOUT_MS}ms`
          : 'failed to launch';

      this.logger.warn(
        {
          evt: 'wa.init.retry',
          attempt,
          maxAttempts: MAX_RESTART_ATTEMPTS,
          outcome,
          cause,
          timeoutMs: READY_TIMEOUT_MS,
        },
        'Reiniciando cliente após tentativa malsucedida',
      );

      await this.safeDestroy();
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }

    this.logger.warn(
      {
        evt: 'wa.init.watchdog_exhausted',
        maxAttempts: MAX_RESTART_ATTEMPTS,
        durationMs: Date.now() - startedAt,
      },
      'Watchdog esgotado, aguardando cliente sem prazo',
    );

    await this.tryInitialize(null);
  }

  private tryInitialize(timeoutMs: number | null): Promise<InitOutcome> {
    return new Promise<InitOutcome>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const startedAt = Date.now();

      this.logger.info(
        { evt: 'wa.init.start', timeoutMs },
        'Inicializando cliente do WhatsApp',
      );

      const finish = (outcome: InitOutcome) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('ready', onReady);
        client.removeListener('qr', onQr);

        this.logger.info(
          {
            evt: 'wa.init.attempt_finished',
            outcome,
            durationMs: Date.now() - startedAt,
          },
          'Tentativa de inicialização concluída',
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
          this.logger.info(
            { evt: 'wa.init.watchdog_paused' },
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
        this.logger.error(
          {
            evt: 'wa.init.failed',
            durationMs: Date.now() - startedAt,
            err,
          },
          'client.initialize() falhou',
        );
        finish('failed');
      });
    });
  }

  private startPageDiagnostics() {
    if (this.diagnosticsTimer) return;

    const page = (client as unknown as { pupPage?: PupPage }).pupPage;
    if (!page) {
      this.logger.debug(
        { evt: 'wa.diagnostics.no_page' },
        'Sem página do puppeteer para instrumentar',
      );
      return;
    }

    if (this.instrumentedPage !== page) {
      page.on('pageerror', (err: unknown) => {
        this.logger.error(
          { evt: 'wa.page_error', err },
          'Erro na página do WhatsApp Web',
        );
      });
      this.instrumentedPage = page;
    }

    this.logger.debug(
      { evt: 'wa.diagnostics.started', intervalMs: DIAGNOSTICS_INTERVAL_MS },
      'Sonda de sincronização iniciada',
    );

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
            this.logger.warn(
              { evt: 'wa.sync_probe.unavailable', raw },
              'Sonda de sincronização não retornou JSON',
            );
            return;
          }

          this.logger.info(
            {
              evt: 'wa.sync_probe',
              state: probe.state,
              stream: probe.stream,
              hasSynced: probe.hasSynced,
              offline: probe.offline,
              wwebjs: probe.wwebjs,
            },
            'Sonda de sincronização',
          );
        })
        .catch((err: unknown) => {
          this.logger.warn(
            { evt: 'wa.sync_probe.failed', err },
            'Sonda de sincronização falhou',
          );
        });
    }, DIAGNOSTICS_INTERVAL_MS);
  }

  private stopPageDiagnostics() {
    if (!this.diagnosticsTimer) return;
    clearInterval(this.diagnosticsTimer);
    this.diagnosticsTimer = undefined;
    this.logger.debug(
      { evt: 'wa.diagnostics.stopped' },
      'Sonda de sincronização encerrada',
    );
  }

  private async safeDestroy() {
    try {
      await client.destroy();
    } catch (err: unknown) {
      this.logger.warn(
        { evt: 'wa.destroy.failed', err },
        'Falha ao destruir o cliente',
      );
    }
  }

  private readonly commands: Record<
    string,
    (client: pkg.Client, message: pkg.Message) => Promise<void>
  > = {
    '!ping': (_client, message) => this.ping(message),
    '!editais andamento': (_client, message) =>
      this.getEditaisAndamento.execute(message),
    '!desativar': (_client, message) => this.deactiveUser.execute(message),
  };

  private registerMessageHandler(client: pkg.Client) {
    client.on('message_create', (message) => {
      this.handleMessage(client, message).catch((err: unknown) =>
        this.logger.error(
          {
            evt: 'wa.message.unhandled_error',
            chatId: maskContact(message.from),
            err,
          },
          'Erro não tratado ao processar mensagem',
        ),
      );
    });
  }

  private async handleMessage(client: pkg.Client, message: pkg.Message) {
    this.logger.debug(
      {
        evt: 'wa.message.received',
        chatId: maskContact(message.from),
        fromMe: message.fromMe,
        bodyLength: message.body?.length ?? 0,
      },
      'Mensagem recebida',
    );

    if (this.loginService.isPending(message.from)) {
      await this.loginService.handlePendingStep(message);
      return;
    }

    if (message.body === '!login') {
      await this.loginService.login(message);
      return;
    }

    const command = this.commands[message.body];
    if (!command) {
      return;
    }

    const user = await this.userService.findByChatId(message.from);
    if (!user) {
      this.logger.info(
        {
          evt: 'wa.command.unauthorized',
          command: message.body,
          chatId: maskContact(message.from),
        },
        'Comando recebido de usuário sem login',
      );
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    const startedAt = Date.now();

    try {
      await command(client, message);

      this.logger.info(
        {
          evt: 'wa.command.done',
          command: message.body,
          userId: user.id,
          durationMs: Date.now() - startedAt,
        },
        'Comando executado',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'wa.command.failed',
          command: message.body,
          userId: user.id,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao executar comando',
      );
      throw error;
    }
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }
}
