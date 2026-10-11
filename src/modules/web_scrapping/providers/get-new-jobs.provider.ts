import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { InjectFlowProducer } from '@nestjs/bullmq';
import { FlowProducer } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JOB_SOURCES, JobSource, ListedJob } from '../sources/job.source.js';
import { NewJobPayload } from '../strategy/new-job.strategy.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { ALL_JOB_TYPES, JOB_TYPES } from '../../jobs/job-types.js';

@Injectable()
export class GetNewJobsProvider {
  constructor(
    private readonly jobsService: JobsService,
    @InjectFlowProducer('notifyAll') private flowProducer: FlowProducer,
    @InjectPinoLogger(GetNewJobsProvider.name)
    private readonly logger: PinoLogger,
    @Inject(JOB_SOURCES)
    private readonly sources: JobSource[],
  ) {}

  @Cron('0 */2 * * *', { timeZone: 'America/Sao_Paulo' })
  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.get_new_jobs', {
      cron: true,
    });

    const timer = log.start('start', 'Iniciando coleta de novos editais');

    try {
      const jobs: NewJobPayload[] = [];
      const failed: string[] = [];

      // Falha em uma fonte não deve impedir a coleta das outras.
      for (const source of this.sources) {
        try {
          jobs.push(...(await this.collect(source, log)));
        } catch (err: unknown) {
          failed.push(source.name);
          log.error(
            'source_failed',
            'Falha na coleta da fonte — seguindo com as outras',
            { source: source.name, err },
          );
        }
      }

      await this.flowProducer.add({
        name: 'notifyAll',
        queueName: 'notifyAll',
        children: [
          ...jobs.map((job) => ({
            name: 'getNewJobs',
            queueName: 'getNewJobs',
            data: job,
            opts: { ignoreDependencyOnFailure: true },
          })),
          {
            name: 'finishJobs',
            queueName: 'finishJobs',
            opts: { ignoreDependencyOnFailure: true },
          },
        ],
      });

      timer.info('done', 'Coleta de novos editais finalizada', {
        enqueued: jobs.length,
        enqueuedByType: Object.fromEntries(
          ALL_JOB_TYPES.map((type) => [
            type,
            jobs.filter((job) => job.type === type).length,
          ]),
        ),
        failed,
      });
    } catch (err: unknown) {
      timer.error('failed', 'Falha na coleta de novos editais', { err });
      throw err;
    }
  }

  // Lista a fonte, descarta o que já está no banco e busca o detalhe do resto.
  async collect(
    source: JobSource,
    log = new ScopedLogger(this.logger, 'cron.get_new_jobs'),
  ) {
    const listed = await source.list();
    const knownLinks = await this.findKnownVagaLinks(listed);
    const jobs = listed.filter((job) => !knownLinks.has(job.link));

    log.info('source_listed', 'Listagem da fonte obtida', {
      source: source.name,
      listedCount: listed.length,
      knownCount: knownLinks.size,
    });

    return await source.fetchDetails(jobs);
  }

  private async findKnownVagaLinks(listed: ListedJob[]) {
    const vagaLinks = listed
      .filter((job) => JOB_TYPES[job.type].kind === 'VAGA')
      .map((job) => job.link);

    if (vagaLinks.length === 0) return new Set<string>();

    const existing = await this.jobsService.findManyByLink(vagaLinks);
    return new Set(existing.map((job) => job.link));
  }
}
