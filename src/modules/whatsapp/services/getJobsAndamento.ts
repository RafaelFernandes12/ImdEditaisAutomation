import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';

@Injectable()
export class GetJobsAndamento {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(GetJobsAndamento.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    const startedAt = Date.now();
    const activeJobs = await this.jobsService.findActive();

    if (activeJobs.length === 0) {
      this.logger.warn(
        {
          evt: 'wa.jobs_andamento.empty',
          chatId: maskContact(message.from),
          durationMs: Date.now() - startedAt,
        },
        'Nenhum edital em andamento para responder',
      );
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    const body = activeJobs
      .map((job, index) => {
        const pdfLines = (job.edital?.pdfs ?? [])
          .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
          .join('\n');

        const subscriptionLine = job.edital
          ? `🗓️ Inscrições até: ${formatDate(job.edital.subscriptionUntil)}\n`
          : '';

        return (
          `*${index + 1}. ${job.title}*\n` +
          subscriptionLine +
          `🔗 ${job.link}\n` +
          `${pdfLines}\n` +
          `${job.summary}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais em andamento*\n\n${body}`);

    this.logger.info(
      {
        evt: 'wa.jobs_andamento.done',
        chatId: maskContact(message.from),
        count: activeJobs.length,
        pdfCount: activeJobs.reduce(
          (acc, e) => acc + (e.edital?.pdfs.length ?? 0),
          0,
        ),
        messageLength: body.length,
        durationMs: Date.now() - startedAt,
      },
      'Editais em andamento enviados',
    );
  }
}
