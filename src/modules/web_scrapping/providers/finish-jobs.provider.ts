import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import {
  ImdScraperService,
  JobWithPdfLinks,
} from '../services/imd-scraper.service.js';
import { JerimunScraperService } from '../services/jerimun-scraper.service.js';
import { JobType } from '../../../../generated/prisma/client.js';
import { StiScraperService } from '../services/sti-scraper.service.js';
import { GithubService } from '../services/github.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class FinishJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private jobsService: JobsService,
    private readonly jerimunScraperService: JerimunScraperService,
    private readonly stiScraperService: StiScraperService,
    private readonly githubService: GithubService,
    @InjectPinoLogger(FinishJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  // Disparado pelo FinishJobsConsumer, dentro do flow da coleta de editais.
  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const timer = log.start('start', 'Verificando editais encerrados');

    try {
      const imdEditaisFinished =
        await this.imdScraperService.getImdEditaisFinished();

      const listedJerimumJobs =
        await this.jerimunScraperService.getListedJobs();
      // Falha na API da STI (já logada no scraper) cai no guard de listagem vazia.
      const listedStiEditais = await this.stiScraperService
        .getEditaisEmAndamento()
        .catch((): JobWithPdfLinks[] => []);
      // Falha na API do GitHub (já logada no service) pula o encerramento delas.
      const githubListings = await this.githubService
        .getListedJobs()
        .catch(() => null);
      const dbActiveimdEditais = await this.jobsService.findActive();

      log.debug(
        'candidates',
        'Comparando editais encerrados com os ativos no banco',
        {
          finishedOnSite: imdEditaisFinished.length,
          jerimumListedOnSite: listedJerimumJobs.length,
          activeInDb: dbActiveimdEditais.length,
        },
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
                log.warn(
                  'valid_until_unparsed',
                  'Não foi possível extrair a validade do edital',
                  {
                    jobId: ef.id,
                    jobTitle: ef.title,
                    hasPdf: Boolean(
                      ef.edital.pdfs?.find((pdf) => pdf.type === 'EDITAL'),
                    ),
                  },
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
        log.warn(
          'jerimum_listing_empty',
          'Listagem do jerimun jobs veio vazia — nenhuma vaga será encerrada nesta execução',
          { activeInDb: dbActiveJerimumJobs.length },
        );
      }

      const jerimumJobsToFinish = skipJerimum
        ? []
        : dbActiveJerimumJobs
            .filter((job) => !listedJerimumLinks.has(job.link))
            .map((job) => ({ id: job.id }));

      const listedStiLinks = new Set(listedStiEditais.map((job) => job.link));
      const dbActiveStiEditais = dbActiveimdEditais.filter(
        (job) => job.type === JobType.STI,
      );

      // Mesmo raciocínio do jerimum: listagem vazia provavelmente é falha na API.
      const skipSti =
        listedStiEditais.length === 0 && dbActiveStiEditais.length > 0;

      if (skipSti) {
        log.warn(
          'sti_listing_empty',
          'Listagem da STI veio vazia — nenhum edital será encerrado nesta execução',
          { activeInDb: dbActiveStiEditais.length },
        );
      }

      const stiEditaisToFinish = skipSti
        ? []
        : dbActiveStiEditais
            .filter((job) => !listedStiLinks.has(job.link))
            .map((job) => ({ id: job.id }));

      if (githubListings === null) {
        log.warn(
          'github_listing_failed',
          'Falha ao listar as issues do GitHub — nenhuma vaga será encerrada nesta execução',
        );
      }

      // Vaga do GitHub encerra quando a issue fecha, ou seja, some da listagem.
      // Listagem truncada ou vazia não é confiável, como no jerimum e na STI.
      const githubJobsToFinish = (githubListings ?? []).flatMap(
        ({ repo, type, jobs, truncated }) => {
          const dbActiveGithubJobs = dbActiveimdEditais.filter(
            (job) => job.type === type,
          );

          if (
            truncated ||
            (jobs.length === 0 && dbActiveGithubJobs.length > 0)
          ) {
            log.warn(
              'github_listing_unreliable',
              'Listagem do GitHub incompleta ou vazia — nenhuma vaga do repo será encerrada nesta execução',
              { repo, truncated, activeInDb: dbActiveGithubJobs.length },
            );
            return [];
          }

          const listedGithubLinks = new Set(jobs.map((job) => job.link));
          return dbActiveGithubJobs
            .filter((job) => !listedGithubLinks.has(job.link))
            .map((job) => ({ id: job.id }));
        },
      );

      await this.jobsService.deactivateMany([
        ...jobsToFinish,
        ...jerimumJobsToFinish,
        ...stiEditaisToFinish,
        ...githubJobsToFinish,
      ]);

      timer.info('done', 'Editais encerrados atualizados', {
        finishedOnSite: imdEditaisFinished.length,
        jerimumListedOnSite: listedJerimumJobs.length,
        activeInDb: dbActiveimdEditais.length,
        stiListedOnSite: listedStiEditais.length,
        githubListedOnSite: githubListings?.reduce(
          (total, listing) => total + listing.jobs.length,
          0,
        ),
        deactivated:
          jobsToFinish.length +
          jerimumJobsToFinish.length +
          stiEditaisToFinish.length +
          githubJobsToFinish.length,
        deactivatedImd: jobsToFinish.length,
        deactivatedJerimum: jerimumJobsToFinish.length,
        deactivatedSti: stiEditaisToFinish.length,
        deactivatedGithub: githubJobsToFinish.length,
        unparsedValidUntil,
      });
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao encerrar editais', { err });
      throw err;
    }
  }
}
