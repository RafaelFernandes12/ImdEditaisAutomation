import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { EditalService } from '../../edital/services/edital.service.js';
import { UserService } from '../../user/services/user.service.js';

@Injectable()
export class GetEditaisAndamento {
  constructor(private editalService: EditalService) {}

  async execute(message: pkg.Message) {
    const activeEditais = await this.editalService.findActive();

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
          `${pdfLines}\n` +
          `${edital.summary}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais em andamento*\n\n${body}`);
  }
}
