import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';

@Injectable()
export class GetNamesCitados {
  constructor(
    private readonly pdfService: PdfService,
    private readonly userService: UserService,
  ) {}

  async execute(message: pkg.Message) {
    // TODO
    const user = await this.userService.findByChatId('oi');
    const editais = await this.pdfService.findAllResultadosByUserName('rafael');

    if (editais.length === 0) {
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    const body = editais
      .map((pdf, index) => {
        return (
          `*${index + 1}. ${pdf.edital.title}*\n` +
          `🗓️ Inscrições até: ${pdf.edital.subscriptionUntil}\n` +
          `🔗 ${pdf.edital.link}\n` +
          `${pdf.label}:${pdf.link}\n` +
          `${pdf.edital.summary}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais que você se inscreveu*\n\n${body}`);
  }
}
