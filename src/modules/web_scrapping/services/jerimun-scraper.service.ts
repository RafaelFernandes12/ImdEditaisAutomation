import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobUrl } from './imd-scraper.service.js';
import { JobType } from '../../../../generated/prisma/client.js';
import { Agent, fetch } from 'undici';
import { JobsService } from '../../jobs/services/jobs.service.js';

const SITE_BASE_URL = 'https://jerimumjobs.imd.ufrn.br';
const JOBS_LIST = `${SITE_BASE_URL}/jerimumjobs/oportunidade/listar`;

@Injectable()
export class JerimunScraperService {
  constructor(
    @InjectPinoLogger(JerimunScraperService.name)
    private readonly logger: PinoLogger,
    private readonly jobsService: JobsService,
  ) {}

  async execute() {
    const startedAt = Date.now();
    const listedJobs = await this.getListedJobs();

    const existingJobs = await this.jobsService.findManyByLink(
      listedJobs.map((job) => job.href),
    );
    const existingLinks = new Set(existingJobs.map((j) => j.link));
    const jobs = listedJobs.filter((job) => !existingLinks.has(job.href));

    this.logger.info(
      {
        evt: 'scraper.jerimun.detail.batch_start',
        count: jobs.length,
        listedCount: listedJobs.length,
        knownCount: listedJobs.length - jobs.length,
      },
      'Buscando detalhes das vagas novas do jerimun jobs',
    );

    const insecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });

    try {
      const detailedJobs = await Promise.all(
        jobs.map(async (job) => {
          const jobStartedAt = Date.now();

          try {
            const jobFetch = await fetch(job.href, {
              dispatcher: insecureAgent,
            });

            if (!jobFetch.ok) {
              this.logger.warn(
                {
                  evt: 'scraper.jerimun.detail.http_not_ok',
                  url: job.href,
                  status: jobFetch.status,
                },
                'Página da vaga respondeu com status inesperado',
              );
            }

            const jobsHTML = await jobFetch.text();
            const $jobLoaded = cheerio.load(jobsHTML);

            const jobText = $jobLoaded('.left-container');
            const title = jobText.find('h1').text();
            const text = jobText.text();

            if (text.length === 0) {
              this.logger.warn(
                {
                  evt: 'scraper.jerimun.detail.empty',
                  url: job.href,
                  htmlLength: jobsHTML.length,
                },
                'Página da vaga não retornou texto — possível mudança no HTML do site',
              );
            }

            this.logger.debug(
              {
                evt: 'scraper.jerimun.detail.done',
                url: job.href,
                jobTitle: title,
                textLength: text.length,
                durationMs: Date.now() - jobStartedAt,
              },
              'Detalhes da vaga obtidos',
            );

            return {
              title,
              type: 'JERIMUM',
              link: job.href,
              text,
              isActive: true,
            };
          } catch (error: unknown) {
            this.logger.error(
              {
                evt: 'scraper.jerimun.detail.failed',
                url: job.href,
                durationMs: Date.now() - jobStartedAt,
                err: error,
              },
              'Falha ao buscar os detalhes da vaga',
            );
            throw error;
          }
        }),
      );

      this.logger.info(
        {
          evt: 'scraper.jerimun.detail.batch_done',
          count: detailedJobs.length,
          durationMs: Date.now() - startedAt,
        },
        'Detalhes das vagas do jerimun jobs obtidos',
      );

      return detailedJobs;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'scraper.jerimun.detail.batch_failed',
          count: jobs.length,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao buscar os detalhes das vagas do jerimun jobs',
      );
      throw error;
    }
  }
  async getListedJobs(): Promise<JobUrl[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.jerimun.list.start', url: SITE_BASE_URL },
      'Buscando listagem de vagas no jerimun jobs',
    );

    try {
      const insecureAgent = new Agent({
        connect: { rejectUnauthorized: false },
      });
      const jobs = await fetch(JOBS_LIST, {
        dispatcher: insecureAgent,
      });

      if (!jobs.ok) {
        this.logger.warn(
          {
            evt: 'scraper.jerimun.list.http_not_ok',
            status: jobs.status,
          },
          'Listagem de vagas respondeu com status inesperado',
        );
      }

      const jobsHTML = await jobs.text();
      const $jobsLoaded = cheerio.load(jobsHTML);

      const jobsHref: JobUrl[] = $jobsLoaded('#vagas-filtradas')
        .find('a')
        .map((_, el) => ({
          href: `${SITE_BASE_URL}${$jobsLoaded(el).attr('href')}`,
          type: JobType.JERIMUM,
          title: $jobsLoaded(el).find('h6').text(),
          subscriptionUntil: new Date(),
        }))
        .get();

      if (jobsHref.length === 0) {
        this.logger.warn(
          {
            evt: 'scraper.jerimun.list.empty',
            htmlLength: jobsHTML.length,
          },
          'Listagem retornou zero vagas — possível mudança no HTML do site',
        );
      }
      this.logger.info(
        {
          evt: 'scraper.jerimun.list.done',
          count: jobsHref.length,
          htmlLength: jobsHTML.length,
          durationMs: Date.now() - startedAt,
        },
        'Listagem de vagas obtida',
      );

      return jobsHref;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'scraper.jerimun.list.failed',
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao buscar a listagem de vagas',
      );
      throw error;
    }
  }
}
