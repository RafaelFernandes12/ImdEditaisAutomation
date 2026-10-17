import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import type { PdfWithJobAndEditalPdf } from '../../pdf/repositories/pdf.repository.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JOB_TYPES, jobTypesOfKind } from '../../jobs/job-types.js';

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
      const group = byEdital.get(pdf.jobId) ?? [];
      group.push(pdf);
      byEdital.set(pdf.jobId, group);
    }

    const groups = [...byEdital.values()];
    const countByType: Record<string, number> = {};

    // Só tipos de edital têm PDF, então só eles podem citar o nome.
    for (const type of jobTypesOfKind('EDITAL')) {
      const groupsOfType = groups.filter((g) => g[0].job.type === type);
      if (groupsOfType.length === 0) continue;

      countByType[type] = groupsOfType.length;
      await message.reply(
        `📢 *${JOB_TYPES[type].header}*\n\n` +
          groupsOfType.map((g) => this.formatEdital(g)).join('\n\n'),
      );
    }

    log.info('done', 'Editais citando o usuário enviados', {
      pdfCount: pdfs.length,
      editalCount: byEdital.size,
      countByType,
    });
  }

  private formatEdital(pdfs: PdfWithJobAndEditalPdf[]) {
    const { job } = pdfs[0];

    const statusLine = job.isActive
      ? '🟢 Em andamento'
      : `🔴 Encerrado${job.finishedAt ? ` em ${formatDate(job.finishedAt)}` : ''}`;

    const dateLine =
      job.isActive && job.subscriptionUntil
        ? `🗓️ Inscrições até: ${formatDate(job.subscriptionUntil)}\n`
        : !job.isActive && job.validUntil
          ? `⏳ Válido até: ${formatDate(job.validUntil)}\n`
          : '';

    const pdfLines = pdfs
      .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
      .join('\n');

    const editalPdfLine = job.pdfs
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
