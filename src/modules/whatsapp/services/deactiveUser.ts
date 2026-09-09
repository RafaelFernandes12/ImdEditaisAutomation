import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { maskContact } from '../../../utils/log-redact.js';

@Injectable()
export class DeactiveUser {
  constructor(
    private readonly pdfService: PdfService,
    private readonly userService: UserService,
    @InjectPinoLogger(DeactiveUser.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    // TODO
    const chat = await message.getChat();

    this.logger.warn(
      {
        evt: 'wa.deactivate.not_implemented',
        chatId: maskContact(message.from),
        isGroup: chat.isGroup,
        unreadCount: chat.unreadCount,
      },
      'Comando !desativar recebido mas ainda não implementado',
    );

    // const user = await this.userService.findByChatId('oi');

    // await message.reply(`📢 *Editais que você se inscreveu*\n\n${body}`);
  }
}
