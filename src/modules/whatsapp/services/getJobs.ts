import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import {
  formatEditalLines,
  formatJobVagaLines,
} from '../../../utils/format-job-lines.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class GetJobs {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(GetJobs.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message, stillActive: boolean) {
    const log = new ScopedLogger(this.logger, 'wa.jobs_andamento', {
      chatId: maskContact(message.from),
    }).timed();
    const activeJobs = await this.jobsService.findActive(stillActive);

    if (activeJobs.length === 0) {
      log.warn('empty', 'Nenhum edital em andamento para responder');
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    const imdEditais = activeJobs.filter((job) => job.type === 'IMD');
    const jerimunJobs = activeJobs.filter((job) => job.type === 'JERIMUM');
    const stiEditais = activeJobs.filter((job) => job.type === 'STI');

    const imdLines = formatEditalLines(imdEditais);
    const jerimunLines = formatJobVagaLines(jerimunJobs);
    const stiLines = formatEditalLines(stiEditais);

    if (imdLines.length > 0) {
      await message.reply(`Editais imd:\n${imdLines}`);
    }
    if (jerimunLines.length > 0) {
      await message.reply(`Oportunidades Jerimun:\n ${jerimunLines}`);
    }
    if (stiLines.length > 0) {
      await message.reply(`Editais STI:\n${stiLines}`);
    }

    log.info('done', 'Editais em andamento enviados', {
      count: activeJobs.length,
      pdfCount: activeJobs.reduce(
        (acc, e) => acc + (e.edital?.pdfs.length ?? 0),
        0,
      ),
      messageLengthImd: imdLines.length,
      messageLengthJerimum: jerimunLines.length,
      messageLengthSti: stiLines.length,
    });
  }
}
