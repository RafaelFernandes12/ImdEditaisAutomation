import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { formatDateBrToUs } from '#src/utils/formate-date.js';
import { JobType } from '../../../../generated/prisma/client.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobUrl, JobWithPdfLinks } from '../models/sources.js';
import { PdfExtractorService } from '../utils/pdf-extractor.service.js';
import { EditalJobPayload } from '../strategy/new-job.strategy.js';
import { JobSource, JobToFinish } from './job.source.js';
import type { ActiveJob } from '../../jobs/services/jobs.service.js';

const SITE_BASE_URL = 'https://www.metropoledigital.ufrn.br';
const JOBS_LIST_URL = `${SITE_BASE_URL}/portal/editais`;

function joinTitleAndBadge(title: string, badge: string) {
  const trimmedTitle = title.trim();
  const trimmedBadge = badge.trim();
  return trimmedBadge ? `${trimmedTitle} - ${trimmedBadge}` : trimmedTitle;
}

@Injectable()
export class ImdSource implements JobSource<JobUrl> {
  readonly name = 'imd';
  readonly types: JobType[] = ['IMD'];
  constructor(
    @InjectPinoLogger(ImdSource.name)
    private readonly logger: PinoLogger,
    private readonly pdfExtractorService: PdfExtractorService,
  ) {}

  async list(): Promise<JobUrl[]> {
    return await this.getJobs('.box-editais-andamentos', 'em_andamento');
  }

  async fetchDetails(jobs: JobUrl[]): Promise<EditalJobPayload[]> {
    const editais = await this.pdfExtractorService.extractPdfs(
      await this.getJobsPdfs(jobs),
    );
    return editais.map((edital) => ({
      ...edital,
      type: 'IMD',
      isActive: true,
    }));
  }

  // Edital do IMD encerra quando aparece na caixa de encerrados do site — sumir
  // da caixa em andamento não basta. A validade (em meses) vem do PDF do edital.
  async findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const finished = await this.getJobs(
      '.box-editais-encerrados',
      'encerrados',
    );
    const finishedLinks = new Set(finished.map((job) => job.link));

    return active
      .filter((job) => finishedLinks.has(job.link) && job.edital)
      .map((job) => {
        const editalPdf = job.edital?.pdfs?.find(
          (pdf) => pdf.type === 'EDITAL',
        );

        const split = editalPdf?.text
          .split('\n')
          ?.find((v) => v.match('validade'))
          ?.match(/(\d+)\s*(?:\([^)]*\)\s*)?m[eê]s(?:es)?/i)?.[1];

        const validUntil = Number(split);

        if (Number.isNaN(validUntil)) {
          log.warn(
            'valid_until_unparsed',
            'Não foi possível extrair a validade do edital',
            { jobId: job.id, jobTitle: job.title, hasPdf: Boolean(editalPdf) },
          );
        }

        return { id: job.id, validUntil };
      });
  }

  private async getJobsPdfs(jobsUrl: JobUrl[]): Promise<JobWithPdfLinks[]> {
    const log = new ScopedLogger(this.logger, 'scraper');
    const timer = log.start(
      'pdf_links.batch_start',
      'Buscando links de PDF dos editais',
      { count: jobsUrl.length },
    );

    const result = await Promise.all(
      jobsUrl.map(async (url) => {
        const jobLog = log.child({ jobUrl: url.link, jobTitle: url.title });
        const jobTimer = jobLog.timed();

        try {
          const jobPage = await fetch(url.link);

          if (!jobPage.ok) {
            jobLog.warn(
              'job_page.http_not_ok',
              'Página do edital respondeu com status inesperado',
              { status: jobPage.status },
            );
          }

          const jobHTML = await jobPage.text();

          const $jobsLoaded = cheerio.load(jobHTML);

          const jobRow = $jobsLoaded('table.tb_noticias tr');

          const downloadHref = jobRow
            .find('a')
            .map((i, el) => ({
              label: $jobsLoaded(el)
                .closest('tr')
                .find('td')
                .eq(1)
                .text()
                .trim(),
              link: `${SITE_BASE_URL}${$jobsLoaded(el).attr('href')}`,
            }))
            .get();

          if (downloadHref.length === 0) {
            jobLog.warn(
              'pdf_links.empty',
              'Nenhum link de PDF encontrado na página do edital',
              { rowCount: jobRow.length },
            );
          }

          jobLog.debug(
            'pdf_links.found',
            'Links de PDF extraídos da página do edital',
            {
              count: downloadHref.length,
              labels: downloadHref.map((d) => d.label),
            },
          );

          jobTimer.debug('job_page.done', 'Página do edital processada', {
            count: downloadHref.length,
          });

          return { ...url, href: downloadHref };
        } catch (err: unknown) {
          jobTimer.error(
            'job_page.failed',
            'Falha ao processar a página do edital',
            { err },
          );
          throw err;
        }
      }),
    );

    const totalPdfLinks = result.reduce((acc, r) => acc + r.href.length, 0);

    timer.info('pdf_links.batch_done', 'Links de PDF coletados', {
      count: result.length,
      totalPdfLinks,
    });

    return result;
  }

  private async getJobs(
    boxName: string,

    listType: 'em_andamento' | 'encerrados',
  ): Promise<JobUrl[]> {
    const log = new ScopedLogger(this.logger, 'scraper.list', { listType });
    const timer = log.start('start', 'Buscando listagem de editais', {
      url: JOBS_LIST_URL,
    });

    try {
      const jobsList = await fetch(JOBS_LIST_URL);

      if (!jobsList.ok) {
        log.warn(
          'http_not_ok',
          'Listagem de editais respondeu com status inesperado',
          { status: jobsList.status },
        );
      }

      const jobsHTML = await jobsList.text();
      const $jobsLoaded = cheerio.load(jobsHTML);

      const jobsHref: JobUrl[] = $jobsLoaded(boxName)
        .find('a')
        .map((_, el) => ({
          link: `${SITE_BASE_URL}${$jobsLoaded(el).attr('href')}`,
          type: JobType.IMD,
          title: joinTitleAndBadge(
            $jobsLoaded(el).find('h5').text(),
            $jobsLoaded(el).find('.badge').first().text(),
          ),
          subscriptionUntil: formatDateBrToUs(
            $jobsLoaded(el).find('p').text().trim().substring(15, 25),
          ),
        }))
        .get();

      if (jobsHref.length === 0) {
        log.warn(
          'empty',
          'Listagem retornou zero editais — possível mudança no HTML do site',
          { boxName, htmlLength: jobsHTML.length },
        );
      }

      timer.info('done', 'Listagem de editais obtida', {
        count: jobsHref.length,
        htmlLength: jobsHTML.length,
      });

      return jobsHref;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de editais', { err });
      throw err;
    }
  }
}
