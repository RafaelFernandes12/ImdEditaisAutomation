import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobUrl } from './imd-scraper.service.js';
import { JobType } from '../../../../generated/prisma/client.js';
import { Agent, fetch } from 'undici';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

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
    const log = new ScopedLogger(this.logger, 'scraper.jerimun.detail');
    const timer = log.timed();
    const listedJobs = await this.getListedJobs();

    const existingJobs = await this.jobsService.findManyByLink(
      listedJobs.map((job) => job.href),
    );
    const existingLinks = new Set(existingJobs.map((j) => j.link));
    const jobs = listedJobs.filter((job) => !existingLinks.has(job.href));

    log.info(
      'batch_start',
      'Buscando detalhes das vagas novas do jerimun jobs',
      {
        count: jobs.length,
        listedCount: listedJobs.length,
        knownCount: listedJobs.length - jobs.length,
      },
    );

    const insecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });

    try {
      const detailedJobs = await Promise.all(
        jobs.map(async (job) => {
          const jobLog = log.child({ url: job.href });
          const jobTimer = jobLog.timed();

          try {
            const jobFetch = await fetch(job.href, {
              dispatcher: insecureAgent,
            });

            if (!jobFetch.ok) {
              jobLog.warn(
                'http_not_ok',
                'Página da vaga respondeu com status inesperado',
                { status: jobFetch.status },
              );
            }

            const jobsHTML = await jobFetch.text();
            const $jobLoaded = cheerio.load(jobsHTML);

            const jobText = $jobLoaded('.left-container');
            const title = jobText.find('h1').text();
            const text = jobText.text();

            if (text.length === 0) {
              jobLog.warn(
                'empty',
                'Página da vaga não retornou texto — possível mudança no HTML do site',
                { htmlLength: jobsHTML.length },
              );
            }

            jobTimer.debug('done', 'Detalhes da vaga obtidos', {
              jobTitle: title,
              textLength: text.length,
            });

            return {
              title,
              type: 'JERIMUM',
              link: job.href,
              text,
              isActive: true,
            };
          } catch (err: unknown) {
            jobTimer.error('failed', 'Falha ao buscar os detalhes da vaga', {
              err,
            });
            throw err;
          }
        }),
      );

      timer.info('batch_done', 'Detalhes das vagas do jerimun jobs obtidos', {
        count: detailedJobs.length,
      });

      return detailedJobs;
    } catch (err: unknown) {
      timer.error(
        'batch_failed',
        'Falha ao buscar os detalhes das vagas do jerimun jobs',
        { count: jobs.length, err },
      );
      throw err;
    }
  }
  async getListedJobs(): Promise<JobUrl[]> {
    const log = new ScopedLogger(this.logger, 'scraper.jerimun.list');
    const timer = log.start(
      'start',
      'Buscando listagem de vagas no jerimun jobs',
      { url: SITE_BASE_URL },
    );

    try {
      const insecureAgent = new Agent({
        connect: { rejectUnauthorized: false },
      });
      const jobs = await fetch(JOBS_LIST, {
        dispatcher: insecureAgent,
      });

      if (!jobs.ok) {
        log.warn(
          'http_not_ok',
          'Listagem de vagas respondeu com status inesperado',
          { status: jobs.status },
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
        log.warn(
          'empty',
          'Listagem retornou zero vagas — possível mudança no HTML do site',
          { htmlLength: jobsHTML.length },
        );
      }
      timer.info('done', 'Listagem de vagas obtida', {
        count: jobsHref.length,
        htmlLength: jobsHTML.length,
      });

      return jobsHref;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de vagas', { err });
      throw err;
    }
  }
}
