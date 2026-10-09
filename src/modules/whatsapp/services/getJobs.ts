import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatJobSections } from '../../../utils/format-job-lines.js';
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

    const sections = formatJobSections(activeJobs);

    for (const { header, body } of sections) {
      await message.reply(`${header}:\n${body}`);
    }

    log.info('done', 'Editais em andamento enviados', {
      count: activeJobs.length,
      pdfCount: activeJobs.reduce(
        (acc, e) => acc + (e.edital?.pdfs.length ?? 0),
        0,
      ),
      messageLengthByType: Object.fromEntries(
        sections.map(({ type, body }) => [type, body.length]),
      ),
    });
  }
}
