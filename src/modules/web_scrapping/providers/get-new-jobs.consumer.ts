import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { extractAllKeywords } from '../services/job-summary-parser.util.js';
import { trimJobForSummary } from '../services/job-text-trimmer.util.js';
import { SummarizeJob } from '../../../modules/ai_chat/services/summarize-job.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { JobType } from '../../../../generated/prisma/client.js';
import { EditalJobType } from '../../jobs/dto/jobs.dto.js';

interface getNewJobsResult {
  isActive: boolean;
  title: string;
  type: JobType;
  link: string;
  subscriptionUntil: Date;
  pdfs: {
    text: string;
    label: string;
    link: string;
  }[];
}

@Processor('getNewJobs')
export class GetNewJobsConsumer extends WorkerHost {
  constructor(
    private jobsService: JobsService,
    private pdfService: PdfService,
    private summarizeJob: SummarizeJob,
    @InjectPinoLogger(GetNewJobsConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job) {
    const startedAt = Date.now();
    const newJob = job.data as getNewJobsResult;

    this.logger.info(
      {
        evt: 'queue.get_new_jobs.job_start',
        queue: 'getNewJobs',
        queueJobId: job.id,
        attempt: job.attemptsMade + 1,
        jobTitle: newJob.title,
        pdfCount: newJob.pdfs.length,
      },
      'Processando novo edital',
    );

    try {
      if (newJob.pdfs.length === 0) {
        this.logger.warn(
          {
            evt: 'queue.get_new_jobs.no_pdfs',
            queue: 'getNewJobs',
            queueJobId: job.id,
            jobTitle: newJob.title,
          },
          'Edital chegou na fila sem nenhum PDF',
        );
        return;
      }

      const trimmed = trimJobForSummary(newJob.pdfs[0].text);

      this.logger.debug(
        {
          evt: 'queue.get_new_jobs.trimmed',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJob.title,
          rawLength: newJob.pdfs[0].text.length,
          trimmedLength: trimmed.length,
        },
        'Texto do edital preparado para o resumo',
      );

      const summarizeStartedAt = Date.now();
      const summary = await this.summarizeJob.execute(trimmed);
      const keyWords = extractAllKeywords(summary).join(', ');

      this.logger.info(
        {
          evt: 'queue.get_new_jobs.summarized',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJob.title,
          summaryLength: summary.length,
          keywordCount: keyWords ? keyWords.split(', ').length : 0,
          durationMs: Date.now() - summarizeStartedAt,
        },
        'Edital resumido pela LLM',
      );

      const createdJob = await this.jobsService.createJob({
        title: newJob.title,
        type: newJob.type as EditalJobType,
        link: newJob.link,
        isActive: newJob.isActive,
        edital: { subscriptionUntil: newJob.subscriptionUntil },
        keyWords,
        summary,
      });

      const pdfCreate = newJob.pdfs.map((pdf) => ({
        ...pdf,
        editalId: createdJob.id,
        type: resolvePdfTipo(pdf.label),
      }));

      await this.pdfService.createMany(pdfCreate);

      this.logger.info(
        {
          evt: 'queue.get_new_jobs.job_done',
          queue: 'getNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          jobId: createdJob.id,
          jobTitle: newJob.title,
          pdfCount: pdfCreate.length,
          pdfTypes: pdfCreate.map((p) => p.type),
          durationMs: Date.now() - startedAt,
        },
        'Edital gravado com seus PDFs',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.get_new_jobs.job_failed',
          queue: 'getNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          jobTitle: newJob.title,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao processar novo edital',
      );
      throw new BadRequestException(e);
    }
  }
}
