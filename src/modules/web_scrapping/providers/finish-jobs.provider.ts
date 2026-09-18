import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { ImdScraperService } from '../services/imd-scraper.service.js';
import { Cron } from '@nestjs/schedule';
import { JerimunScraperService } from '../services/jerimun-scraper.service.js';
import { JobType } from '../../../../generated/prisma/client.js';

@Injectable()
export class FinishJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private jobsService: JobsService,
    private readonly jerimunScraperService: JerimunScraperService,
    @InjectPinoLogger(FinishJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron('10 8,17 * * 1-5', { timeZone: 'America/Sao_Paulo' })
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.finish_jobs.start', cron: true },
      'Verificando editais encerrados',
    );

    try {
      const imdEditaisFinished =
        await this.imdScraperService.getImdEditaisFinished();

      const listedJerimumJobs =
        await this.jerimunScraperService.getListedJobs();
      const dbActiveimdEditais = await this.jobsService.findActive();

      this.logger.debug(
        {
          evt: 'cron.finish_jobs.candidates',
          cron: true,
          finishedOnSite: imdEditaisFinished.length,
          jerimumListedOnSite: listedJerimumJobs.length,
          activeInDb: dbActiveimdEditais.length,
        },
        'Comparando editais encerrados com os ativos no banco',
      );

      let unparsedValidUntil = 0;

      const jobsToFinish = dbActiveimdEditais
        .flatMap((ef) =>
          imdEditaisFinished.flatMap((dae) => {
            if (dae.href === ef.link) {
              if (!ef.edital) return;

              const split = ef.edital.pdfs
                ?.find((pdf) => pdf.type === 'EDITAL')
                ?.text.split('\n')
                ?.find((v) => v.match('validade'))
                ?.match(/(\d+)\s*(?:\([^)]*\)\s*)?m[eê]s(?:es)?/i)?.[1];

              const validUntil = Number(split);

              if (Number.isNaN(validUntil)) {
                unparsedValidUntil += 1;
                this.logger.warn(
                  {
                    evt: 'cron.finish_jobs.valid_until_unparsed',
                    cron: true,
                    jobId: ef.id,
                    jobTitle: ef.title,
                    hasPdf: Boolean(
                      ef.edital.pdfs?.find((pdf) => pdf.type === 'EDITAL'),
                    ),
                  },
                  'Não foi possível extrair a validade do edital',
                );
              }

              return {
                id: ef.id,
                validUntil,
              };
            }
          }),
        )
        .filter((f) => f !== undefined);

      const listedJerimumLinks = new Set(
        listedJerimumJobs.map((job) => job.href),
      );
      const dbActiveJerimumJobs = dbActiveimdEditais.filter(
        (job) => job.type === JobType.JERIMUM,
      );

      // Uma listagem vazia normalmente significa site fora do ar ou mudança no
      // HTML, não que todas as vagas encerraram — desativar tudo seria irreversível.
      const skipJerimum =
        listedJerimumJobs.length === 0 && dbActiveJerimumJobs.length > 0;

      if (skipJerimum) {
        this.logger.warn(
          {
            evt: 'cron.finish_jobs.jerimum_listing_empty',
            cron: true,
            activeInDb: dbActiveJerimumJobs.length,
          },
          'Listagem do jerimun jobs veio vazia — nenhuma vaga será encerrada nesta execução',
        );
      }

      const jerimumJobsToFinish = skipJerimum
        ? []
        : dbActiveJerimumJobs
            .filter((job) => !listedJerimumLinks.has(job.link))
            .map((job) => ({ id: job.id }));

      await this.jobsService.deactivateMany([
        ...jobsToFinish,
        ...jerimumJobsToFinish,
      ]);

      this.logger.info(
        {
          evt: 'cron.finish_jobs.done',
          cron: true,
          finishedOnSite: imdEditaisFinished.length,
          jerimumListedOnSite: listedJerimumJobs.length,
          activeInDb: dbActiveimdEditais.length,
          deactivated: jobsToFinish.length + jerimumJobsToFinish.length,
          deactivatedImd: jobsToFinish.length,
          deactivatedJerimum: jerimumJobsToFinish.length,
          unparsedValidUntil,
          durationMs: Date.now() - startedAt,
        },
        'Editais encerrados atualizados',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.finish_jobs.failed',
          cron: true,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao encerrar editais',
      );
      throw error;
    }
  }
}
