import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';

@Injectable()
export class GetEditaisAndamento {
  constructor(
    private editalService: EditalService,
    @InjectPinoLogger(GetEditaisAndamento.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    const startedAt = Date.now();
    const activeEditais = await this.editalService.findActive();

    if (activeEditais.length === 0) {
      this.logger.warn(
        {
          evt: 'wa.editais_andamento.empty',
          chatId: maskContact(message.from),
          durationMs: Date.now() - startedAt,
        },
        'Nenhum edital em andamento para responder',
      );
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
          `🗓️ Inscrições até: ${formatDate(edital.subscriptionUntil)}\n` +
          `🔗 ${edital.link}\n` +
          `${pdfLines}\n` +
          `${edital.summary}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais em andamento*\n\n${body}`);

    this.logger.info(
      {
        evt: 'wa.editais_andamento.done',
        chatId: maskContact(message.from),
        count: activeEditais.length,
        pdfCount: activeEditais.reduce((acc, e) => acc + e.pdfs.length, 0),
        messageLength: body.length,
        durationMs: Date.now() - startedAt,
      },
      'Editais em andamento enviados',
    );
  }
}
