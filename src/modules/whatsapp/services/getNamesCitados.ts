import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import type { PdfWithJobAndEditalPdf } from '../../pdf/repositories/pdf.repository.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class GetNamesCitados {
  constructor(
    private readonly pdfService: PdfService,
    private readonly userService: UserService,
    @InjectPinoLogger(GetNamesCitados.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    const baseLog = new ScopedLogger(this.logger, 'wa.names_citados', {
      chatId: maskContact(message.from),
    }).timed();

    const user = await this.userService.findByChatId(message.from);
    if (!user) {
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    const log = baseLog.child({ userId: user.id });
    const pdfs = await this.pdfService.findAllByUserName(user.name.trim());

    if (pdfs.length === 0) {
      log.info('empty', 'Nenhum PDF citando o usuário');
      await message.reply('Seu nome não foi citado em nenhum edital ainda.');
      return;
    }

    // Um mesmo edital pode citar o nome em vários PDFs (homologação, resultado...)
    const byEdital = new Map<number, PdfWithJobAndEditalPdf[]>();
    for (const pdf of pdfs) {
      const group = byEdital.get(pdf.editalId) ?? [];
      group.push(pdf);
      byEdital.set(pdf.editalId, group);
    }

    const groups = [...byEdital.values()];
    const imdGroups = groups.filter((g) => g[0].edital.job.type === 'IMD');
    const stiGroups = groups.filter((g) => g[0].edital.job.type === 'STI');

    if (imdGroups.length > 0) {
      await message.reply(
        `📢 *Editais IMD*\n\n` +
          imdGroups.map((g) => this.formatEdital(g)).join('\n\n'),
      );
    }
    if (stiGroups.length > 0) {
      await message.reply(
        `📢 *Editais STI*\n\n` +
          stiGroups.map((g) => this.formatEdital(g)).join('\n\n'),
      );
    }

    log.info('done', 'Editais citando o usuário enviados', {
      pdfCount: pdfs.length,
      editalCount: byEdital.size,
      imdCount: imdGroups.length,
      stiCount: stiGroups.length,
    });
  }

  private formatEdital(pdfs: PdfWithJobAndEditalPdf[]) {
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

    const editalPdfLine = edital.pdfs
      .map((pdf) => `📑 Edital: ${pdf.link}\n`)
      .join('');

    return (
      `*${job.title}*\n` +
      `${statusLine}\n` +
      dateLine +
      `🔗 ${job.link}\n` +
      editalPdfLine +
      `📄 Citado em:\n${pdfLines}`
    );
  }
}
