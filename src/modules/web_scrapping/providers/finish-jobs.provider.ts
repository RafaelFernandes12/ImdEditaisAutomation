import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { ImdScraperService } from '../services/imd-scraper.service.js';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class FinishJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private jobsService: JobsService,
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
      const jobsFinished = await this.imdScraperService.getJobsFinished();
      const dbActiveJobs = await this.jobsService.findActive();

      this.logger.debug(
        {
          evt: 'cron.finish_jobs.candidates',
          cron: true,
          finishedOnSite: jobsFinished.length,
          activeInDb: dbActiveJobs.length,
        },
        'Comparando editais encerrados com os ativos no banco',
      );

      let unparsedValidUntil = 0;

      const jobsToFinish = dbActiveJobs
        .flatMap((ef) =>
          jobsFinished.flatMap((dae) => {
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

      await this.jobsService.deactivateMany(jobsToFinish);

      this.logger.info(
        {
          evt: 'cron.finish_jobs.done',
          cron: true,
          finishedOnSite: jobsFinished.length,
          activeInDb: dbActiveJobs.length,
          deactivated: jobsToFinish.length,
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
