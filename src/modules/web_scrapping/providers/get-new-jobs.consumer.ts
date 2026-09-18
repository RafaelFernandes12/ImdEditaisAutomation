import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { extractAllKeywords } from '../services/job-summary-parser.util.js';
import { trimJobForSummary } from '../services/job-text-trimmer.util.js';
import { SummarizeJobEditalImd } from '../../ai_chat/services/summarize-job-edital-imd.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { JobType } from '../../../../generated/prisma/client.js';
import { EditalJobType } from '../../jobs/dto/jobs.dto.js';
import { SummarizeJobJerimum } from '../../ai_chat/services/summarize-job-jerimum.service.js';

interface jerimumJobs {
  title: string;
  type: string;
  link: string;
  text: string;
  isActive: boolean;
}

interface getNewImdEditais {
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
    private summarizeJobEditalImd: SummarizeJobEditalImd,
    private readonly summarizeJobJerimum: SummarizeJobJerimum,
    @InjectPinoLogger(GetNewJobsConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job) {
    const newJob = job.data as getNewImdEditais | jerimumJobs;
    if ('pdfs' in newJob) {
      await this.processEditalImd(job, newJob);
    } else {
      await this.processJerimumJob(job, newJob);
    }
  }
  private async processEditalImd(job: Job, newJobImd: getNewImdEditais) {
    const startedAt = Date.now();

    this.logger.info(
      {
        evt: 'queue.get_new_jobs.job_start',
        queue: 'getNewJobs',
        queueJobId: job.id,
        attempt: job.attemptsMade + 1,
        jobTitle: newJobImd.title,
        pdfCount: newJobImd.pdfs.length,
      },
      'Processando novo edital',
    );

    try {
      if (newJobImd.pdfs.length === 0) {
        this.logger.warn(
          {
            evt: 'queue.get_new_jobs.no_pdfs',
            queue: 'getNewJobs',
            queueJobId: job.id,
            jobTitle: newJobImd.title,
          },
          'Edital chegou na fila sem nenhum PDF',
        );
        return;
      }

      const trimmed = trimJobForSummary(newJobImd.pdfs[0].text);

      this.logger.debug(
        {
          evt: 'queue.get_new_jobs.trimmed',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJobImd.title,
          rawLength: newJobImd.pdfs[0].text.length,
          trimmedLength: trimmed.length,
        },
        'Texto do edital preparado para o resumo',
      );

      const summarizeStartedAt = Date.now();
      const summary = await this.summarizeJobEditalImd.execute(trimmed);
      const keyWords = extractAllKeywords(summary).join(', ');

      this.logger.info(
        {
          evt: 'queue.get_new_jobs.summarized',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJobImd.title,
          summaryLength: summary.length,
          keywordCount: keyWords ? keyWords.split(', ').length : 0,
          durationMs: Date.now() - summarizeStartedAt,
        },
        'Edital resumido pela LLM',
      );

      const createdJob = await this.jobsService.createJob({
        title: newJobImd.title,
        type: newJobImd.type as EditalJobType,
        link: newJobImd.link,
        isActive: newJobImd.isActive,
        edital: { subscriptionUntil: newJobImd.subscriptionUntil },
        keyWords,
        summary,
      });

      const pdfCreate = newJobImd.pdfs.map((pdf) => ({
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
          jobTitle: newJobImd.title,
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
          jobTitle: newJobImd.title,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao processar novo edital',
      );
      throw new BadRequestException(e);
    }
  }
  private async processJerimumJob(job: Job, newJobJerimum: jerimumJobs) {
    const startedAt = Date.now();

    this.logger.info(
      {
        evt: 'queue.get_new_jobs.jerimum.job_start',
        queue: 'getNewJobs',
        queueJobId: job.id,
        attempt: job.attemptsMade + 1,
        jobTitle: newJobJerimum.title,
        link: newJobJerimum.link,
      },
      'Processando nova vaga do jerimun jobs',
    );

    try {
      const trimmed = trimJobForSummary(newJobJerimum.text);

      this.logger.debug(
        {
          evt: 'queue.get_new_jobs.jerimum.trimmed',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJobJerimum.title,
          rawLength: newJobJerimum.text.length,
          trimmedLength: trimmed.length,
        },
        'Texto da vaga preparado para o resumo',
      );

      const summarizeStartedAt = Date.now();
      const summary = await this.summarizeJobJerimum.execute(trimmed);
      const keyWords = extractAllKeywords(summary).join(', ');

      this.logger.info(
        {
          evt: 'queue.get_new_jobs.jerimum.summarized',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobTitle: newJobJerimum.title,
          summaryLength: summary.length,
          keywordCount: keyWords ? keyWords.split(', ').length : 0,
          durationMs: Date.now() - summarizeStartedAt,
        },
        'Vaga resumida pela LLM',
      );

      const createdJob = await this.jobsService.createJob({
        title: newJobJerimum.title,
        type: 'JERIMUM',
        link: newJobJerimum.link,
        isActive: newJobJerimum.isActive,
        jerimum: { description: newJobJerimum.text },
        keyWords,
        summary,
      });

      this.logger.info(
        {
          evt: 'queue.get_new_jobs.jerimum.job_done',
          queue: 'getNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          jobId: createdJob.id,
          jobTitle: newJobJerimum.title,
          durationMs: Date.now() - startedAt,
        },
        'Vaga do jerimun jobs gravada',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.get_new_jobs.jerimum.job_failed',
          queue: 'getNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          jobTitle: newJobJerimum.title,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao processar nova vaga do jerimun jobs',
      );
      throw new BadRequestException(e);
    }
  }
}
