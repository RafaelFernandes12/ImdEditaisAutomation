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

    const imdEditais = activeJobs.filter((job) => job.type === 'IMD');
    const jerimunJobs = activeJobs.filter((job) => job.type === 'JERIMUM');

    const imdLines = imdEditais
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
      .join('\n');
    const jerimunLines = jerimunJobs
      .map((newJob, index) => {
        return (
          `*${index + 1}. ${newJob.title}*\n` +
          `🔗 ${newJob.link}\n` +
          `${newJob.summary}`
        );
      })
      .join('\n');

    if (imdLines.length > 0) {
      await message.reply(`Editais imd:\n${imdLines}`);
    }
    if (jerimunLines.length > 0) {
      await message.reply(`Oportunidades Jerimun:\n ${jerimunLines}`);
    }

    this.logger.info(
      {
        evt: 'wa.jobs_andamento.done',
        chatId: maskContact(message.from),
        count: activeJobs.length,
        pdfCount: activeJobs.reduce(
          (acc, e) => acc + (e.edital?.pdfs.length ?? 0),
          0,
        ),
        messageLengthImd: imdLines.length,
        messageLengthJerimum: jerimunLines.length,
        durationMs: Date.now() - startedAt,
      },
      'Editais em andamento enviados',
    );
  }
}
