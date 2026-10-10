import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JOB_SOURCES, JobSource, JobToFinish } from '../sources/job.source.js';
import { ActiveJob, JobsService } from '../../jobs/services/jobs.service.js';

@Injectable()
export class FinishJobsProvider {
  constructor(
    private readonly jobsService: JobsService,
    @Inject(JOB_SOURCES)
    private readonly sources: JobSource[],
    @InjectPinoLogger(FinishJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  // Disparado pelo FinishJobsConsumer, dentro do flow da coleta de editais.
  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const timer = log.start('start', 'Verificando editais encerrados');

    const deactivatedBySource: Record<string, number> = {};
    const failed: string[] = [];

    // Falha em uma fonte não deve impedir o encerramento das outras.
    for (const source of this.sources) {
      try {
        const active = await this.jobsService.findActiveByTypes(source.types);
        const toFinish = source.findFinished
          ? await source.findFinished(active)
          : await this.findMissingFromListing(source, active, log);

        await this.jobsService.deactivateMany(toFinish);
        deactivatedBySource[source.name] = toFinish.length;

        log.info('source_done', 'Vagas encerradas da fonte atualizadas', {
          source: source.name,
          activeInDb: active.length,
          deactivated: toFinish.length,
          // Encerrar não tem volta: os ids permitem auditar o que saiu.
          deactivatedIds: toFinish.map((job) => job.id),
          unparsedValidUntil: toFinish.filter((job) =>
            Number.isNaN(job.validUntil),
          ).length,
        });
      } catch (err: unknown) {
        failed.push(source.name);
        log.error(
          'source_failed',
          'Falha ao encerrar as vagas da fonte — seguindo com as outras',
          { source: source.name, err },
        );
      }
    }

    if (failed.length > 0) {
      timer.error('failed', 'Falha ao encerrar editais', {
        deactivatedBySource,
        failed,
      });
      throw new Error(
        `Falha ao encerrar vagas das fontes: ${failed.join(', ')}`,
      );
    }

    timer.info('done', 'Editais encerrados atualizados', {
      deactivatedBySource,
    });
  }

  // Encerramento padrão: vaga ativa que sumiu da listagem da fonte encerrou.
  private async findMissingFromListing(
    source: JobSource,
    active: ActiveJob[],
    log: ScopedLogger,
  ): Promise<JobToFinish[]> {
    const listed = await source.list();

    log.info(
      'listing_fetched',
      'Listagem da fonte obtida para o encerramento',
      {
        source: source.name,
        listedOnSite: listed.length,
      },
    );

    return source.types.flatMap((type) => {
      const activeOfType = active.filter((job) => job.type === type);
      const listedOfType = listed.filter((job) => job.type === type);

      if (listedOfType.length === 0 && activeOfType.length > 0) {
        log.warn(
          'listing_empty',
          'Listagem vazia — nenhuma vaga do tipo será encerrada nesta execução',
          { source: source.name, type, activeInDb: activeOfType.length },
        );
        return [];
      }

      const listedLinks = new Set(listedOfType.map((job) => job.link));
      return activeOfType
        .filter((job) => !listedLinks.has(job.link))
        .map((job) => ({ id: job.id }));
    });
  }
}
