import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { trimJobForSummary } from '../utils/job-text-trimmer.util.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EditalStrategy } from '../strategy/edital.strategy.js';
import { VagaStrategy } from '../strategy/vaga.strategy.js';
import {
  NewJobPayload,
  NewJobStrategies,
  NewJobStrategy,
} from '../strategy/new-job.strategy.js';
import { BadRequestException } from '@nestjs/common';
import { JOB_TYPES } from '../../jobs/job-types.js';
import { SummarizeJob } from '../../ai_chat/services/summarize-job.service.js';
import { toVagas } from '../utils/job-summary.util.js';
import { CambioService } from '../utils/cambio.service.js';

@Processor('getNewJobs')
export class GetNewJobsConsumer extends WorkerHost {
  private readonly strategies: NewJobStrategies;
  constructor(
    editalJobStrategy: EditalStrategy,
    vagaJobStrategy: VagaStrategy,
    private readonly summarizeJob: SummarizeJob,
    private readonly cambio: CambioService,
    @InjectPinoLogger(GetNewJobsConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
    this.strategies = {
      EDITAL: editalJobStrategy,
      VAGA: vagaJobStrategy,
    };
  }

  async process(job: Job) {
    const newJob = job.data as NewJobPayload;
    // O payload vem da fila: o tipo pode não existir mais no JOB_TYPES.
    const kind = (
      JOB_TYPES[newJob.type] as
        (typeof JOB_TYPES)[typeof newJob.type] | undefined
    )?.kind;
    const strategy = kind
      ? (this.strategies[kind] as NewJobStrategy<NewJobPayload>)
      : undefined;

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
    try {
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
      const resumo = await this.summarizeJob.execute(newJob, trimmed);
      const summarizeMs = Date.now() - summarizeStartedAt;

      // Só consulta o câmbio quando alguma vaga paga em outra moeda.
      const cotacoes = resumo.vagas.some(
        (vaga) => vaga.moeda && vaga.moeda !== 'BRL',
      )
        ? await this.cambio.cotacoes()
        : {};
      // O que a fonte já informa estruturado vale mais que a leitura da IA.
      const known = 'attributes' in newJob ? newJob.attributes : undefined;
      const vagas = toVagas(resumo, cotacoes).map((vaga) => ({
        ...vaga,
        ...known,
      }));

      // O GitHub informa quando a issue foi criada; nas outras fontes vale o
      // dia da coleta.
      const publishedAt = newJob.publishedAt
        ? new Date(newJob.publishedAt)
        : new Date();

      const { jobId, logContext } = await strategy.persist(
        newJob,
        vagas,
        publishedAt,
      );

      this.logger.info(
        {
          ...baseLog,
          ...logContext,
          evt: 'queue.get_new_jobs.job_done',
          attempt: job.attemptsMade + 1,
          jobId,
          summarizeMs,
          durationMs: Date.now() - startedAt,
        },
        'Vaga gravada',
      );
    } catch (err: unknown) {
      this.logger.error(
        {
          ...baseLog,
          evt: 'queue.get_new_jobs.job_failed',
          attempt: job.attemptsMade + 1,
          link: newJob.link,
          durationMs: Date.now() - startedAt,
          err,
        },
        'Falha ao processar a vaga',
      );
      throw err;
    }
  }
}
