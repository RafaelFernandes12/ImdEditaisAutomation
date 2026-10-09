import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { extractAllKeywords } from '../services/job-summary-parser.util.js';
import { trimJobForSummary } from '../services/job-text-trimmer.util.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EditalStrategy } from '../strategy/edital.strategy.js';
import { JerimumStrategy } from '../strategy/jerimum.strategy.js';
import { GithubStrategy } from '../strategy/github.strategy.js';
import {
  NewJobPayload,
  NewJobStrategies,
  NewJobStrategy,
} from '../strategy/new-job.strategy.js';
import { BadRequestException } from '@nestjs/common';

@Processor('getNewJobs')
export class GetNewJobsConsumer extends WorkerHost {
  private readonly strategies: NewJobStrategies;
  constructor(
    editalJobStrategy: EditalStrategy,
    jerimumJobStrategy: JerimumStrategy,
    githubJobStrategy: GithubStrategy,
    @InjectPinoLogger(GetNewJobsConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
    this.strategies = {
      IMD: editalJobStrategy,
      STI: editalJobStrategy,
      JERIMUM: jerimumJobStrategy,
      BACKEND_GITHUB: githubJobStrategy,
      FRONTEND_GITHUB: githubJobStrategy,
    };
  }

  async process(job: Job) {
    const newJob = job.data as NewJobPayload;
    const strategy = this.strategies[newJob.type] as
      NewJobStrategy<NewJobPayload> | undefined;

    if (!strategy) {
      this.logger.error(
        {
          evt: 'queue.get_new_jobs.unknown_type',
          queue: 'getNewJobs',
          queueJobId: job.id,
          jobType: newJob.type,
          jobTitle: newJob.title,
        },
        'Vaga chegou na fila com tipo sem estratégia',
      );
      throw new BadRequestException(
        `Tipo de vaga desconhecido: ${newJob.type}`,
      );
    }
    await this.processWithStrategy(job, newJob, strategy);
  }

  private async processWithStrategy(
    job: Job,
    newJob: NewJobPayload,
    strategy: NewJobStrategy<NewJobPayload>,
  ) {
    const startedAt = Date.now();
    const baseLog = {
      queue: 'getNewJobs',
      queueJobId: job.id,
      jobType: newJob.type,
      jobTitle: newJob.title,
    };

    this.logger.info(
      {
        ...baseLog,
        evt: 'queue.get_new_jobs.job_start',
        attempt: job.attemptsMade + 1,
        link: newJob.link,
      },
      'Processando nova vaga',
    );
    const text = strategy.getText(newJob);

    if (!text) {
      this.logger.warn(
        { ...baseLog, evt: 'queue.get_new_jobs.no_text' },
        'Vaga chegou na fila sem texto para resumir',
      );
      return;
    }
    const trimmed = trimJobForSummary(text);

    const summarizeStartedAt = Date.now();
    const summary = await strategy.summarize(trimmed);
    const keyWords = extractAllKeywords(summary).join(', ');

    const { jobId, logContext } = await strategy.persist(
      newJob,
      summary,
      keyWords,
    );

    this.logger.info(
      {
        ...baseLog,
        ...logContext,
        evt: 'queue.get_new_jobs.job_done',
        attempt: job.attemptsMade + 1,
        jobId,
        durationMs: Date.now() - startedAt,
      },
      'Vaga gravada',
    );
  }
}
