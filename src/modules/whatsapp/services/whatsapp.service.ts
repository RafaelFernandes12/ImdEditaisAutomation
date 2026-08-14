import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WhatsappRepository } from '../repositories/whatsapp.repository.js';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import qrcode from 'qrcode-terminal';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private whatsappRepository: WhatsappRepository,
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
    '!login': (client, message) => this.login(client, message),
    '!editais andamento': (_client, message) =>
      this.getEditaisAndamento(message),
  };

  private sendMessage(client: pkg.Client) {
    client.on('message_create', (message) => {
      void (async () => {
        const command = this.commands[message.body];
        if (command) {
          await command(client, message);
        }
      })().catch((err) => console.log(err));
    });
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }

  private async login(client: pkg.Client, message: pkg.Message) {
    const editaisId = (await this.whatsappRepository.getEditaisActive()).map(
      (id) => id.id,
    );
    await this.userService.createUser({
      chatId: message.from,
      contact: await client.getFormattedNumber(message.to),
      editaisId,
    });
    await this.getEditaisAndamento(message);
  }

  private async getEditaisAndamento(message: pkg.Message) {
    const activeEditais = await this.whatsappRepository.getEditaisActive();

    if (activeEditais.length === 0) {
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    const body = activeEditais
      .map((edital, index) => {
        const pdfLines = edital.pdfs
          .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
          .join('\n');

        return (
          `*${index + 1}. ${edital.title}*\n` +
          `🗓️ Inscrições até: ${edital.subscriptionUntil}\n` +
          `🔗 ${edital.link}\n` +
          `${pdfLines}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais em andamento*\n\n${body}`);
  }
}
