import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobType } from '../../../../generated/prisma/client.js';
import { Agent, fetch } from 'undici';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobUrl } from '../models/sources.js';
import { JobSource } from './job.source.js';
import { VagaJobPayload } from '../strategy/new-job.strategy.js';

const SITE_BASE_URL = 'https://jerimumjobs.imd.ufrn.br';
const JOBS_LIST = `${SITE_BASE_URL}/jerimumjobs/oportunidade/listar`;

@Injectable()
export class JerimunSource implements JobSource<JobUrl> {
  readonly name = 'jerimum';
  readonly types: JobType[] = ['JERIMUM'];
  constructor(
    @InjectPinoLogger(JerimunSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<JobUrl[]> {
    return await this.getListedJobs();
  }

  async fetchDetails(jobs: JobUrl[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.jerimun.detail');
    const timer = log.timed();

    log.info('batch_start', 'Buscando detalhes das vagas do jerimun jobs', {
      count: jobs.length,
    });

    const insecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });

    try {
      const detailedJobs: VagaJobPayload[] = await Promise.all(
        jobs.map(async (job) => {
          const jobLog = log.child({ url: job.link });
          const jobTimer = jobLog.timed();

          try {
            const jobFetch = await fetch(job.link, {
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
              link: job.link,
              description: text,
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

  private async getListedJobs(): Promise<JobUrl[]> {
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
          link: `${SITE_BASE_URL}${$jobsLoaded(el).attr('href')}`,
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
