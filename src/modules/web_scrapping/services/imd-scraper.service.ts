import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { formatDateBrToUs } from '#src/utils/formate-date.js';
import { JobType } from '../../../../generated/prisma/client.js';

const SITE_BASE_URL = 'https://www.metropoledigital.ufrn.br';
const JOBS_LIST_URL = `${SITE_BASE_URL}/portal/editais`;

function joinTitleAndBadge(title: string, badge: string) {
  const trimmedTitle = title.trim();
  const trimmedBadge = badge.trim();
  return trimmedBadge ? `${trimmedTitle} - ${trimmedBadge}` : trimmedTitle;
}

export interface JobUrl {
  href: string;
  title: string;
  type: JobType;
  subscriptionUntil: Date;
}

export interface JobPdfLink {
  label: string;
  link: string;
}

export interface JobWithPdfLinks extends Omit<JobUrl, 'href'> {
  link: string;
  href: JobPdfLink[];
}

@Injectable()
export class ImdScraperService {
  constructor(
    private readonly pdfService: PdfService,
    @InjectPinoLogger(ImdScraperService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getJobsEmAndamento(): Promise<JobUrl[]> {
    return this.getJobs('.box-editais-andamentos', 'em_andamento');
  }

  async getJobsFinished(): Promise<JobUrl[]> {
    return this.getJobs('.box-editais-encerrados', 'encerrados');
  }

  async getJobsPdfs(jobsUrl: JobUrl[]): Promise<JobWithPdfLinks[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.pdf_links.batch_start', count: jobsUrl.length },
      'Buscando links de PDF dos editais',
    );

    const result = await Promise.all(
      jobsUrl.map(async (url) => {
        const jobStartedAt = Date.now();

        try {
          const jobPage = await fetch(url.href);

          if (!jobPage.ok) {
            this.logger.warn(
              {
                evt: 'scraper.job_page.http_not_ok',
                status: jobPage.status,
                jobUrl: url.href,
                jobTitle: url.title,
              },
              'Página do edital respondeu com status inesperado',
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
            this.logger.warn(
              {
                evt: 'scraper.pdf_links.empty',
                jobUrl: url.href,
                jobTitle: url.title,
                rowCount: jobRow.length,
              },
              'Nenhum link de PDF encontrado na página do edital',
            );
          }

          this.logger.debug(
            {
              evt: 'scraper.pdf_links.found',
              jobUrl: url.href,
              jobTitle: url.title,
              count: downloadHref.length,
              labels: downloadHref.map((d) => d.label),
            },
            'Links de PDF extraídos da página do edital',
          );

          downloadHref.filter(
            (download) =>
              this.pdfService.findByLink(download.link) === undefined,
          );

          this.logger.debug(
            {
              evt: 'scraper.job_page.done',
              jobUrl: url.href,
              jobTitle: url.title,
              count: downloadHref.length,
              durationMs: Date.now() - jobStartedAt,
            },
            'Página do edital processada',
          );

          return {
            ...url,
            link: url.href,
            href: downloadHref,
          };
        } catch (error: unknown) {
          this.logger.error(
            {
              evt: 'scraper.job_page.failed',
              jobUrl: url.href,
              jobTitle: url.title,
              durationMs: Date.now() - jobStartedAt,
              err: error,
            },
            'Falha ao processar a página do edital',
          );
          throw error;
        }
      }),
    );

    const totalPdfLinks = result.reduce((acc, r) => acc + r.href.length, 0);

    this.logger.info(
      {
        evt: 'scraper.pdf_links.batch_done',
        count: result.length,
        totalPdfLinks,
        durationMs: Date.now() - startedAt,
      },
      'Links de PDF coletados',
    );

    return result;
  }

  private async getJobs(
    boxName: string,

    listType: 'em_andamento' | 'encerrados',
  ): Promise<JobUrl[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.list.start', listType, url: JOBS_LIST_URL },
      'Buscando listagem de editais',
    );

    try {
      const jobsList = await fetch(JOBS_LIST_URL);

      if (!jobsList.ok) {
        this.logger.warn(
          {
            evt: 'scraper.list.http_not_ok',
            listType,
            status: jobsList.status,
          },
          'Listagem de editais respondeu com status inesperado',
        );
      }

      const jobsHTML = await jobsList.text();
      const $jobsLoaded = cheerio.load(jobsHTML);

      const jobsHref: JobUrl[] = $jobsLoaded(boxName)
        .find('a')
        .map((_, el) => ({
          href: `${SITE_BASE_URL}${$jobsLoaded(el).attr('href')}`,
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
        this.logger.warn(
          {
            evt: 'scraper.list.empty',
            listType,
            boxName,
            htmlLength: jobsHTML.length,
          },
          'Listagem retornou zero editais — possível mudança no HTML do site',
        );
      }

      this.logger.info(
        {
          evt: 'scraper.list.done',
          listType,
          count: jobsHref.length,
          htmlLength: jobsHTML.length,
          durationMs: Date.now() - startedAt,
        },
        'Listagem de editais obtida',
      );

      return jobsHref;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'scraper.list.failed',
          listType,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao buscar a listagem de editais',
      );
      throw error;
    }
  }
}
