import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PDFParse } from 'pdf-parse';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { ImdScraperService, JobUrl } from './imd-scraper.service.js';
import { formatDateBrToUs } from '#src/utils/formate-date.js';
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
    const jobs = await this.getJobs();

    const insecureAgent = new Agent({
      connect: { rejectUnauthorized: false },
    });
    const fetch2 = await fetch(jobs[0].href, { dispatcher: insecureAgent });

    const jobsHTML = await fetch2.text();
    console.log('JOBSHTML', jobsHTML);
    await Promise.all(
      jobs.map(async (job) => {
        const jobFetch = await fetch(job.href, {
          dispatcher: insecureAgent,
        });

        const jobsHTML = await jobFetch.text();
        const $jobLoaded = cheerio.load(jobsHTML);

        const jobText = $jobLoaded('left-container');
        const downloadHref = jobText
          .find('a')
          .map((i, el) => ({
            label: $jobLoaded(el).closest('tr').find('td').eq(1).text().trim(),
            link: `${SITE_BASE_URL}${$jobLoaded(el).attr('href')}`,
          }))
          .get();
      }),
    );
  }
  private async getJobs(): Promise<JobUrl[]> {
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
            evt: 'scraper.list.http_not_oj',
            status: jobs.status,
          },
          'Listagem de editais respondeu com status inesperado',
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
            evt: 'scraper.list.empty',
            htmlLength: jobsHTML.length,
          },
          'Listagem retornou zero editais — possível mudança no HTML do site',
        );
      }
      const jobsLinks = jobsHref.map((job) => job.href);
      const existingJobs = await this.jobsService.findManyByLink(jobsLinks);
      const existingLinks = new Set(existingJobs.map((j) => j.link));
      const filteredJobs = jobsHref.filter(
        (job) => !existingLinks.has(job.href),
      );

      this.logger.info(
        {
          evt: 'scraper.list.done',
          count: jobsHref.length,
          htmlLength: jobsHTML.length,
          durationMs: Date.now() - startedAt,
        },
        'Listagem de editais obtida',
      );

      return filteredJobs;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'scraper.list.failed',
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao buscar a listagem de editais',
      );
      throw error;
    }
  }
}
