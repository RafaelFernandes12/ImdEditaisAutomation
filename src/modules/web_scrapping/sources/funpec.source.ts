import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { JobType } from '../../../../generated/prisma/client.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobUrl, JobWithPdfLinks } from '../models/sources.js';
import { PdfExtractorService } from '../utils/pdf-extractor.service.js';
import { EditalJobPayload } from '../strategy/new-job.strategy.js';
import { JobSource, JobToFinish } from './job.source.js';
import type { ActiveJob } from '../../jobs/services/jobs.service.js';
import { EcosystemFilterService } from '../utils/ecosystem-filter.service.js';

const SITE_BASE_URL = 'https://funpec.br';
const JOBS_LIST_URL = `${SITE_BASE_URL}/processos-seletivos`;
// Trava de segurança: a paginação para quando a página vem vazia.
const MAX_LIST_PAGES = 20;

type ProcessoStatus = 'novos' | 'em-andamento' | 'encerrados';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// "4.4. As inscrições estarão abertas no período das 17h do dia 07 de outubro
// de 2026 até as 23h59min do dia 12 de outubro de 2026" — vale a data do "até".
const SUBSCRIPTION_UNTIL =
  /inscri[çc][õo]es\s+estar[ãa]o\s+abertas[\s\S]{0,200}?\sat[ée]\s[\s\S]{0,60}?(?:(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})|(\d{2})\/(\d{2})\/(\d{4}))/i;

function parseSubscriptionUntil(text: string) {
  const match = text.replace(/\s+/g, ' ').match(SUBSCRIPTION_UNTIL);
  if (!match) return null;

  const [, day, monthName, year, numDay, numMonth, numYear] = match;
  if (numDay) {
    return new Date(Number(numYear), Number(numMonth) - 1, Number(numDay));
  }

  const month = MONTHS.indexOf(monthName.toLowerCase());
  if (month === -1) return null;
  return new Date(Number(year), month, Number(day));
}

function listUrl(status: ProcessoStatus, page: number) {
  const query = page > 1 ? `?pagina=${page}` : '';
  return `${JOBS_LIST_URL}/${status}/${query}`;
}

@Injectable()
export class FunpecSource implements JobSource<JobUrl> {
  readonly name = 'funpec';
  readonly types: JobType[] = ['FUNPEC'];
  constructor(
    @InjectPinoLogger(FunpecSource.name)
    private readonly logger: PinoLogger,
    private readonly pdfExtractorService: PdfExtractorService,
    private readonly ecosystemFilterService: EcosystemFilterService,
  ) {}

  async list() {
    return await this.getJobs('novos');
  }

  async fetchDetails(jobs: JobUrl[]): Promise<EditalJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper');
    const extracted = await this.pdfExtractorService.extractPdfs(
      await this.getJobsPdfs(jobs),
    );
    // A FUNPEC seleciona para qualquer área (psicólogo, arquiteto, cuidador...).
    const editais = await this.ecosystemFilterService.filter(
      this.name,
      extracted,
    );

    // A página do processo só tem os PDFs: o prazo sai do texto do edital.
    return editais.map((edital) => {
      const subscriptionUntil = edital.pdfs
        .map((pdf) => parseSubscriptionUntil(pdf.text))
        .find((date) => date !== null);

      if (!subscriptionUntil) {
        log.warn(
          'subscription_until_unparsed',
          'Prazo de inscrição não encontrado nos PDFs — usando a data da coleta',
          { jobUrl: edital.link, jobTitle: edital.title },
        );
      }

      return {
        ...edital,
        subscriptionUntil: subscriptionUntil ?? edital.subscriptionUntil,
        type: 'FUNPEC',
        isActive: true,
      };
    });
  }

  // Processo da FUNPEC passa de "novos" para "em andamento" durante a seleção;
  // só encerra quando sai das duas listagens (vai para "encerrados"). A
  // validade (em meses) vem do PDF do edital.
  async findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const [novos, andamento] = await Promise.all([
      this.getJobs('novos'),
      this.getJobs('em-andamento'),
    ]);
    const openLinks = new Set([...novos, ...andamento].map((job) => job.link));

    // Encerrar não tem volta: listagem vazia é mais provável ser HTML quebrado
    // do que todos os processos terem encerrado de uma vez.
    if (openLinks.size === 0 && active.length > 0) {
      log.warn(
        'listing_empty',
        'Listagens novos/em andamento vazias — nenhum processo encerrado',
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

          const content = $jobsLoaded('.funpec-selection-process-content');

          const downloadHref = content
            .find('a[href]')
            .filter((_, el) => /\.pdf$/i.test($jobsLoaded(el).attr('href')!))
            .map((_, el) => ({
              label: $jobsLoaded(el).text().trim(),
              link: new URL($jobsLoaded(el).attr('href')!, url.link).href,
            }))
            .get();

          if (downloadHref.length === 0) {
            jobLog.warn(
              'pdf_links.empty',
              'Nenhum link de PDF encontrado na página do edital',
              { contentLength: content.text().length },
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

  private async getJobs(status: ProcessoStatus): Promise<JobUrl[]> {
    const log = new ScopedLogger(this.logger, 'scraper.list', { status });
    const timer = log.start('start', 'Buscando listagem de processos', {
      url: listUrl(status, 1),
    });

    try {
      const jobsHref: JobUrl[] = [];
      let page = 1;

      for (; page <= MAX_LIST_PAGES; page++) {
        const jobsList = await fetch(listUrl(status, page));

        if (!jobsList.ok) {
          log.warn(
            'http_not_ok',
            'Listagem de processos respondeu com status inesperado',
            { status: jobsList.status, page },
          );
        }

        const jobsHTML = await jobsList.text();
        const $jobsLoaded = cheerio.load(jobsHTML);

        // A listagem não informa o prazo; ele vem do PDF em fetchDetails.
        const pageJobs: JobUrl[] = $jobsLoaded(
          'a.section-selection-processes__box',
        )
          .map((_, el) => ({
            link: $jobsLoaded(el).attr('href') ?? '',
            type: JobType.FUNPEC,
            title: $jobsLoaded(el)
              .find('.section-selection-processes__title')
              .text()
              .trim(),
            subscriptionUntil: new Date(),
          }))
          .get()
          .filter((job) => job.link !== '' && job.title !== '');

        // Página além da última responde 200 sem nenhum processo.
        if (pageJobs.length === 0) break;
        jobsHref.push(...pageJobs);
      }

      if (jobsHref.length === 0 && status !== 'novos') {
        log.warn(
          'empty',
          'Listagem retornou zero processos — possível mudança no HTML do site',
          { pages: page },
        );
      }

      timer.info('done', 'Listagem de processos obtida', {
        count: jobsHref.length,
        pages: page,
      });

      return jobsHref;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de processos', {
        err,
      });
      throw err;
    }
  }
}
