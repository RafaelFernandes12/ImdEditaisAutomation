import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import qrcode from 'qrcode-terminal';
import { client } from '../../../config/whatsapp/client.js';
import { LoginService } from './login.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';

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

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private loginService: LoginService,
    private getEditaisAndamento: GetEditaisAndamento,
    private userService: UserService,
    private readonly logger: Logger,
  ) {}

  private diagnosticsTimer?: NodeJS.Timeout;

  onModuleInit() {
    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      this.logger.log('QR RECEIVED', qr);
      // Also started here, not just on `loading_screen`: a session restored
      // from the volume never shows a loading screen, and that boot needs the
      // same visibility.
      this.startPageDiagnostics();
    });

    // The stretch between a scan and `ready` is where boots die silently, so
    // every milestone WhatsApp Web reports in between gets logged.
    client.on('authenticated', () => {
      this.logger.log('Client authenticated, waiting for sync');
    });

    // Bound to the client, not to tryInitialize's one-shot listener: that one is
    // removed once the first boot settles, so later ready events left the probe
    // running and reporting a healthy client as stalled.
    client.on('ready', () => this.stopPageDiagnostics());

    client.on('loading_screen', (percent, message) => {
      this.logger.log(`Loading screen: ${percent}% ${message}`);
      this.startPageDiagnostics();
    });

    client.on('change_state', (state) => {
      this.logger.log(`Client state changed: ${state}`);
    });

    client.on('disconnected', (reason) => {
      this.logger.error(`Client disconnected: ${reason}`);
    });

    client.on('auth_failure', (message) => {
      this.logger.error(`Client auth failure: ${message}`);
    });

    this.registerMessageHandler(client);

    this.initializeWithWatchdog().catch((err) => this.logger.error(err));
  }
  async onModuleDestroy() {
    this.stopPageDiagnostics();
    // Awaited so Nest's shutdown hooks close the browser before the process
    // exits, instead of leaving it orphaned holding the session profile.
    await this.safeDestroy();
  }

  private async initializeWithWatchdog() {
    // Bounded fast retries to recover from a stalled boot, then a final attempt
    // with no deadline. The fallback matters: waiting forever is the original
    // behaviour, so this can never end up worse than not having a watchdog.
    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      const outcome = await this.tryInitialize(READY_TIMEOUT_MS);
      if (outcome === 'ready') {
        return;
      }

      const cause =
        outcome === 'timeout'
          ? `not ready within ${READY_TIMEOUT_MS}ms`
          : 'failed to launch';
      this.logger.warn(
        `Client ${cause} (attempt ${attempt}/${MAX_RESTART_ATTEMPTS}), restarting client`,
      );
      await this.safeDestroy();
      // A launch failure resolves instantly, so without a pause every attempt
      // is spent inside the same second as the first one.
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }

    this.logger.warn(
      'Watchdog exhausted, waiting for client without a deadline',
    );
    await this.tryInitialize(null);
  }

  /**
   * Resolves 'ready' once the client is ready, 'timeout' if it stalls past
   * timeoutMs, 'failed' if initialize() rejects. Pass null to wait forever.
   */
  private tryInitialize(timeoutMs: number | null): Promise<InitOutcome> {
    return new Promise<InitOutcome>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (outcome: InitOutcome) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('ready', onReady);
        client.removeListener('qr', onQr);
        resolve(outcome);
      };

      const onReady = () => {
        this.logger.log('Client is ready!');
        this.stopPageDiagnostics();
        finish('ready');
      };

      // A QR means the client is alive and blocked on a human, not stalled.
      // Restarting here would invalidate the code mid-scan, so drop the deadline.
      const onQr = () => {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
          this.logger.log('QR pending scan, watchdog paused');
        }
      };

      client.once('ready', onReady);
      client.on('qr', onQr);

      if (timeoutMs !== null) {
        timer = setTimeout(() => finish('timeout'), timeoutMs);
      }

      // Not awaited before arming the timer: initialize() can hang internally
      // (it navigates with timeout disabled), which is exactly what we guard.
      client.initialize().catch((err) => {
        this.logger.error(`Client initialize failed: ${err}`);
        finish('failed');
      });
    });
  }

  /**
   * Boots stall between the scan and `ready`: `loading_screen` reaches 100% but
   * `change:hasSynced` never fires, so WhatsApp unlinks the device 3 minutes
   * later. Nothing surfaces the socket state in that window, so poll for it.
   */
  private startPageDiagnostics() {
    if (this.diagnosticsTimer) return;

    const page = (client as unknown as { pupPage?: PupPage }).pupPage;
    if (!page) return;

    page.on('pageerror', (err) => {
      this.logger.error(`Page error: ${String(err)}`);
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
        .then((snapshot) => this.logger.warn(`Sync probe: ${String(snapshot)}`))
        .catch((err) => this.logger.warn(`Sync probe failed: ${err}`));
    }, DIAGNOSTICS_INTERVAL_MS);
  }

  private stopPageDiagnostics() {
    if (!this.diagnosticsTimer) return;
    clearInterval(this.diagnosticsTimer);
    this.diagnosticsTimer = undefined;
  }

  private async safeDestroy() {
    try {
      await client.destroy();
    } catch (err) {
      this.logger.warn(`Failed to destroy client: ${err}`);
    }
  }

  private readonly commands: Record<
    string,
    (client: pkg.Client, message: pkg.Message) => Promise<void>
  > = {
    '!ping': (_client, message) => this.ping(message),
    '!editais andamento': (_client, message) =>
      this.getEditaisAndamento.execute(message),
  };

  private registerMessageHandler(client: pkg.Client) {
    client.on('message_create', (message) => {
      this.handleMessage(client, message).catch((err) =>
        this.logger.error(err),
      );
    });
  }

  private async handleMessage(client: pkg.Client, message: pkg.Message) {
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
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    await command(client, message);
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }
}
