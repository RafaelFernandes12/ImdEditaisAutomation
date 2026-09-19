import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import type { PdfWithJob } from '../../pdf/repositories/pdf.repository.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';

@Injectable()
export class GetNamesCitados {
  constructor(
    private readonly pdfService: PdfService,
    private readonly userService: UserService,
    @InjectPinoLogger(GetNamesCitados.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    const startedAt = Date.now();

    const user = await this.userService.findByChatId(message.from);
    if (!user) {
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    const pdfs = await this.pdfService.findAllByUserName(user.name.trim());

    if (pdfs.length === 0) {
      this.logger.info(
        {
          evt: 'wa.names_citados.empty',
          chatId: maskContact(message.from),
          userId: user.id,
          durationMs: Date.now() - startedAt,
        },
        'Nenhum PDF citando o usuário',
      );
      await message.reply('Seu nome não foi citado em nenhum edital ainda.');
      return;
    }

    // Um mesmo edital pode citar o nome em vários PDFs (homologação, resultado...)
    const byEdital = new Map<number, PdfWithJob[]>();
    for (const pdf of pdfs) {
      const group = byEdital.get(pdf.editalId) ?? [];
      group.push(pdf);
      byEdital.set(pdf.editalId, group);
    }

    await message.reply(
      `📢 *Seu nome foi citado em ${byEdital.size} edital(is)*`,
    );

    for (const group of byEdital.values()) {
      await message.reply(this.formatEdital(group));
    }

    this.logger.info(
      {
        evt: 'wa.names_citados.done',
        chatId: maskContact(message.from),
        userId: user.id,
        pdfCount: pdfs.length,
        editalCount: byEdital.size,
        durationMs: Date.now() - startedAt,
      },
      'Editais citando o usuário enviados',
    );
  }

  private formatEdital(pdfs: PdfWithJob[]) {
    const { edital } = pdfs[0];
    const { job } = edital;

    const statusLine = job.isActive
      ? '🟢 Em andamento'
      : `🔴 Encerrado${job.finishedAt ? ` em ${formatDate(job.finishedAt)}` : ''}`;

    const dateLine = job.isActive
      ? `🗓️ Inscrições até: ${formatDate(edital.subscriptionUntil)}\n`
      : edital.validUntil
        ? `⏳ Válido até: ${formatDate(edital.validUntil)}\n`
        : '';

    const pdfLines = pdfs
      .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
      .join('\n');

    return (
      `*${job.title}*\n` +
      `${statusLine}\n` +
      dateLine +
      `🔗 ${job.link}\n` +
      `📄 Citado em:\n${pdfLines}\n\n` +
      `${job.summary}`
    );
  }
}
