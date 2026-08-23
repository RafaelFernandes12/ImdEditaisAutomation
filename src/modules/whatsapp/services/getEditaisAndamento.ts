import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { EditalService } from '../../edital/services/edital.service.js';
import { UserService } from '../../user/services/user.service.js';

@Injectable()
export class GetEditaisAndamento {
  constructor(
    private editalService: EditalService,
    private userService: UserService,
  ) {}

  async execute(message: pkg.Message) {
    const activeEditais = await this.editalService.findActive();

    if (activeEditais.length === 0) {
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    await this.sendPdfEditais(message, activeEditais);

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

  private async sendPdfEditais(
    message: pkg.Message,
    activeEditais: Awaited<ReturnType<EditalService['findActive']>>,
  ) {
    const user = await this.userService.findByChatId(message.from);
    if (!user) {
      return;
    }

    const newEditaisId = activeEditais
      .filter(
        (edital) =>
          !user.editais.some((userEdital) => userEdital.editalId === edital.id),
      )
      .map((edital) => edital.id);

    if (newEditaisId.length === 0) {
      return;
    }

    await this.userService.updateEditaisUser({
      contact: user.contact,
      editaisId: newEditaisId,
    });
  }
}
