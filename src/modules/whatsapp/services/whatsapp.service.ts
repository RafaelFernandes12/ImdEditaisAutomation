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

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private loginService: LoginService,
    private getEditaisAndamento: GetEditaisAndamento,
    private userService: UserService,
    private readonly logger: Logger,
  ) {}

  onModuleInit() {
    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      this.logger.log('QR RECEIVED', qr);
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
    // Awaited so Nest's shutdown hooks close the browser before the process
    // exits, instead of leaving it orphaned holding the session profile.
    await this.safeDestroy();
  }

  private async initializeWithWatchdog() {
    // Bounded fast retries to recover from a stalled boot, then a final attempt
    // with no deadline. The fallback matters: waiting forever is the original
    // behaviour, so this can never end up worse than not having a watchdog.
    for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
      if (await this.tryInitialize(READY_TIMEOUT_MS)) {
        return;
      }

      this.logger.warn(
        `Client not ready within ${READY_TIMEOUT_MS}ms (attempt ${attempt}/${MAX_RESTART_ATTEMPTS}), restarting client`,
      );
      await this.safeDestroy();
    }

    this.logger.warn(
      'Watchdog exhausted, waiting for client without a deadline',
    );
    await this.tryInitialize(null);
  }

  /**
   * Resolves true once the client is ready, false if it stalls past timeoutMs.
   * Pass null to wait indefinitely.
   */
  private tryInitialize(timeoutMs: number | null): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;

      const finish = (becameReady: boolean) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('ready', onReady);
        client.removeListener('qr', onQr);
        resolve(becameReady);
      };

      const onReady = () => {
        this.logger.log('Client is ready!');
        finish(true);
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
        timer = setTimeout(() => finish(false), timeoutMs);
      }

      // Not awaited before arming the timer: initialize() can hang internally
      // (it navigates with timeout disabled), which is exactly what we guard.
      client.initialize().catch((err) => {
        this.logger.error(`Client initialize failed: ${err}`);
        finish(false);
      });
    });
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
