import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { formatDateBrToUs } from '#src/utils/formate-date.js';
import { JobType } from '../../../../generated/prisma/client.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobUrl, JobWithPdfLinks } from '../models/sources.js';
import { PdfExtractorService } from '../utils/pdf-extractor.service.js';
import { EditalJobPayload } from '../strategy/new-job.strategy.js';
import { JobSource, JobToFinish, SourceWeight } from './job.source.js';
import type { ActiveJob } from '../../jobs/services/jobs.service.js';
import { EcosystemFilterService } from '../utils/ecosystem-filter.service.js';

const SITE_BASE_URL = 'https://lais.huol.ufrn.br';
const JOBS_LIST_URL = `${SITE_BASE_URL}/categoria/editais`;
const MAX_LIST_PAGES = 20;

type EditalStatus = 'aberto' | 'andamento' | 'concluido';

export interface LaisListedJob extends Omit<JobUrl, 'subscriptionUntil'> {
  publishedAt: Date;
}

const DATE_BR = String.raw`(\d{2}\/\d{2}\/\d{4})`;
const SUBSCRIPTION_PERIOD = new RegExp(
  String.raw`per[ií]odo\s+de\s+${DATE_BR}\s+(?:a|até)\s+${DATE_BR}`,
  'i',
);

function listUrl(status: EditalStatus, page: number) {
  const pagePath = page > 1 ? `/page/${page}` : '';
  return `${JOBS_LIST_URL}${pagePath}/?edital_status=${status}`;
}

@Injectable()
export class LaisSource implements JobSource<LaisListedJob> {
  readonly name = 'lais';
  readonly types: JobType[] = ['LAIS'];

  readonly weight: SourceWeight = [
    [
      this.types[0],
      {
        ecossytem: 65,
        escolaridade: 20,
        salary: 5,
        formato: 5,
        city: 0,
        modelo: 5,
        senioridade: 0,
        priority: 1.4,
      },
    ],
  ];
  constructor(
    @InjectPinoLogger(LaisSource.name)
    private readonly logger: PinoLogger,
    private readonly pdfExtractorService: PdfExtractorService,
    private readonly ecosystemFilterService: EcosystemFilterService,
  ) {}

  async list() {
    return await this.getJobs('aberto');
  }

  async fetchDetails(jobs: LaisListedJob[]): Promise<EditalJobPayload[]> {
    const publishedAtByLink = new Map(
      jobs.map((job) => [job.link, job.publishedAt]),
    );
    const extracted = await this.pdfExtractorService.extractPdfs(
      await this.getJobsPdfs(jobs),
    );
    // O LAIS publica editais de saúde também (fonoaudiologia, medicina...).
    const editais = await this.ecosystemFilterService.filter(
      this.name,
      extracted,
    );

    return editais.map((edital) => ({
      ...edital,
      type: 'LAIS',
      isActive: true,
      publishedAt: publishedAtByLink.get(edital.link)?.toISOString(),
    }));
  }

  // Edital do LAIS passa de "inscrições abertas" para "em andamento" durante a
  // seleção; só encerra quando sai das duas listagens (vai para "concluído").
  // A validade (em meses) vem do PDF do edital.
  async findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const [aberto, andamento] = await Promise.all([
      this.getJobs('aberto'),
      this.getJobs('andamento'),
    ]);
    const openLinks = new Set([...aberto, ...andamento].map((job) => job.link));

    // Encerrar não tem volta: listagem vazia é mais provável ser HTML quebrado
    // do que todos os editais terem concluído de uma vez.
    if (openLinks.size === 0 && active.length > 0) {
      log.warn(
        'listing_empty',
        'Listagens aberto/andamento vazias — nenhum edital encerrado',
        { activeInDb: active.length },
      );
      return [];
    }

    return active
      .filter((job) => !openLinks.has(job.link) && job.kind === 'EDITAL')
      .map((job) => {
        const editalPdf = job.pdfs.find((pdf) => pdf.type === 'EDITAL');

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

  private async getJobsPdfs(
    jobsUrl: LaisListedJob[],
  ): Promise<JobWithPdfLinks[]> {
    const log = new ScopedLogger(this.logger, 'scraper');
    const timer = log.start(
      'pdf_links.batch_start',
      'Buscando links de PDF dos editais',
      { count: jobsUrl.length },
    );

    const result = await Promise.all(
      jobsUrl.map(async ({ publishedAt, ...url }) => {
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

          const article = $jobsLoaded('.post-content article');

          // O link do edital costuma vir como "aqui"; o rótulo decide o tipo do
          // PDF (resolvePdfTipo), então ele vira "Edital".
          const downloadHref = article
            .find('a[href$=".pdf"]')
            .map((_, el) => {
              const text = $jobsLoaded(el).text().trim();
              return {
                label: text.toLowerCase() === 'aqui' ? 'Edital' : text,
                link: new URL($jobsLoaded(el).attr('href')!, url.link).href,
              };
            })
            .get();

          if (downloadHref.length === 0) {
            jobLog.warn(
              'pdf_links.empty',
              'Nenhum link de PDF encontrado na página do edital',
              { articleLength: article.text().length },
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

          const period = article.text().match(SUBSCRIPTION_PERIOD);
          let subscriptionUntil = publishedAt;

          if (period) {
            subscriptionUntil = formatDateBrToUs(period[2]);
          } else {
            jobLog.warn(
              'subscription_until_unparsed',
              'Prazo de inscrição não encontrado na página do edital — usando a data de publicação',
              { publishedAt },
            );
          }

          jobTimer.debug('job_page.done', 'Página do edital processada', {
            count: downloadHref.length,
          });

          return { ...url, subscriptionUntil, href: downloadHref };
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

  private async getJobs(status: EditalStatus): Promise<LaisListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.list', { status });
    const timer = log.start('start', 'Buscando listagem de editais', {
      url: listUrl(status, 1),
    });

    try {
      const jobsHref: LaisListedJob[] = [];
      let page = 1;

      for (; page <= MAX_LIST_PAGES; page++) {
        const jobsList = await fetch(listUrl(status, page));

        // Página além da última responde 404.
        if (page > 1 && jobsList.status === 404) break;

        if (!jobsList.ok) {
          log.warn(
            'http_not_ok',
            'Listagem de editais respondeu com status inesperado',
            { status: jobsList.status, page },
          );
        }

        const jobsHTML = await jobsList.text();
        const $jobsLoaded = cheerio.load(jobsHTML);

        const pageJobs: LaisListedJob[] = $jobsLoaded('.card-editais')
          .map((_, el) => ({
            link: $jobsLoaded(el).find('.card-body a').attr('href') ?? '',
            type: JobType.LAIS,
            title: $jobsLoaded(el).find('.card-body h4').text().trim(),
            publishedAt: formatDateBrToUs(
              $jobsLoaded(el).find('.card-footer .card-text').text().trim(),
            ),
          }))
          .get()
          .filter((job) => job.link !== '' && job.title !== '');

        if (pageJobs.length === 0) break;
        jobsHref.push(...pageJobs);
      }

      if (jobsHref.length === 0 && status !== 'aberto') {
        log.warn(
          'empty',
          'Listagem retornou zero editais — possível mudança no HTML do site',
          { pages: page },
        );
      }

      timer.info('done', 'Listagem de editais obtida', {
        count: jobsHref.length,
        pages: page,
      });

      return jobsHref;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de editais', { err });
      throw err;
    }
  }
}
