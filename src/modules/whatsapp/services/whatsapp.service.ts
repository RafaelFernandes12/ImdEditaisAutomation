import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsappRepository } from '../repositories/whatsapp.repository.js';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import qrcode from 'qrcode-terminal';
import { client } from '../../../config/whatsapp/client.js';
import { LoginService } from './login.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private whatsappRepository: WhatsappRepository,
    private loginService: LoginService,
    private getEditaisAndamento: GetEditaisAndamento,
    private userService: UserService,
    private readonly logger: Logger,
  ) {}

  onModuleInit() {
    client.once('ready', () => {
      console.log('Client is ready!');
    });

    client.on('qr', (qr) => {
      qrcode.generate(qr, { small: true });
      console.log('QR RECEIVED', qr);
    });

    this.sendMessage(client);

    client.initialize();
  }
  onModuleDestroy() {
    client.destroy();
  }

  private readonly commands: Record<
    string,
    (client: pkg.Client, message: pkg.Message) => Promise<void>
  > = {
    '!ping': (_client, message) => this.ping(message),
    '!editais andamento': (_client, message) =>
      this.getEditaisAndamento.execute(message),
  };

  private sendMessage(client: pkg.Client) {
    client.on('message_create', (message) => {
      void (async () => {
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
      })().catch((err) => this.logger.error(err));
    });
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }
}
