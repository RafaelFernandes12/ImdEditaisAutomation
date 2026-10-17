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

const JOBS_LIST_URL = 'https://www.ect.ufrn.br/documentos/?tipo=editais';

// Abas da listagem; todas vêm na mesma página.
type EditalStatus = 'novo' | 'emandamento' | 'encerrado';

export interface EctListedJob extends JobUrl {
  publishedAt: Date;
}

@Injectable()
export class EctSource implements JobSource<EctListedJob> {
  readonly name = 'ect';
  readonly types: JobType[] = ['ECT'];
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
    @InjectPinoLogger(EctSource.name)
    private readonly logger: PinoLogger,
    private readonly pdfExtractorService: PdfExtractorService,
    private readonly ecosystemFilterService: EcosystemFilterService,
  ) {}

  async list() {
    return (await this.getJobs()).novo;
  }

  async fetchDetails(jobs: EctListedJob[]): Promise<EditalJobPayload[]> {
    const publishedAtByLink = new Map(
      jobs.map((job) => [job.link, job.publishedAt]),
    );
    const extracted = await this.pdfExtractorService.extractPdfs(
      await this.getJobsPdfs(jobs),
    );
    // A ECT publica editais de qualquer tipo (dispensa de disciplina, eleição,
    // bolsas de pós do PRH-ANP...); só os de desenvolvimento citam ecossistema.
    const editais = await this.ecosystemFilterService.filter(
      this.name,
      extracted,
    );

    return editais.map((edital) => ({
      ...edital,
      type: 'ECT',
      isActive: true,
      publishedAt: publishedAtByLink.get(edital.link)?.toISOString(),
    }));
  }

  // Edital da ECT passa de "Novo" para "Em andamento" durante a seleção; só
  // encerra quando sai das duas abas (vai para "Encerrado"). A validade (em
  // meses) vem do PDF do edital.
  async findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const log = new ScopedLogger(this.logger, 'cron.finish_jobs', {
      cron: true,
    });

    const { novo, emandamento } = await this.getJobs();
    const openLinks = new Set([...novo, ...emandamento].map((job) => job.link));

    // Encerrar não tem volta: listagem vazia é mais provável ser HTML quebrado
    // do que todos os editais terem encerrado de uma vez.
    if (openLinks.size === 0 && active.length > 0) {
      log.warn(
        'listing_empty',
        'Abas novo/em andamento vazias — nenhum edital encerrado',
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
    jobsUrl: EctListedJob[],
  ): Promise<JobWithPdfLinks[]> {
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

          const content = $jobsLoaded('.article-content');

          // Algumas páginas listam do documento mais novo para o mais antigo;
          // o edital vai na frente porque o resumo da IA lê o primeiro PDF.
          const downloadHref = content
            .find('a[href]')
            .filter((_, el) => /\.pdf$/i.test($jobsLoaded(el).attr('href')!))
            .map((_, el) => ({
              label: $jobsLoaded(el).text().trim(),
              link: new URL($jobsLoaded(el).attr('href')!, url.link).href,
            }))
            .get()
            .sort(
              (a, b) =>
                Number(/edital/i.test(b.label)) -
                Number(/edital/i.test(a.label)),
            );

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

  // A página traz as três abas de uma vez, cada edital com o período de
  // inscrições na tabela: o fim vira o prazo, o início a data de publicação.
  private async getJobs(): Promise<Record<EditalStatus, EctListedJob[]>> {
    const log = new ScopedLogger(this.logger, 'scraper.list');
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

      const tab = (status: EditalStatus): EctListedJob[] =>
        $jobsLoaded(`#tab-${status} table tbody tr`)
          .map((_, el) => {
            const cells = $jobsLoaded(el).find('td');
            const anchor = cells.eq(0).find('a');
            return {
              link: anchor.attr('href') ?? '',
              type: JobType.ECT,
              title: anchor.text().trim(),
              publishedAt: formatDateBrToUs(cells.eq(1).text().trim()),
              subscriptionUntil: formatDateBrToUs(cells.eq(2).text().trim()),
            };
          })
          .get()
          .filter((job) => job.link !== '' && job.title !== '');

      const jobs = {
        novo: tab('novo'),
        emandamento: tab('emandamento'),
        encerrado: tab('encerrado'),
      };

      if (jobs.encerrado.length === 0) {
        log.warn(
          'empty',
          'Aba de encerrados veio vazia — possível mudança no HTML do site',
          { htmlLength: jobsHTML.length },
        );
      }

      timer.info('done', 'Listagem de editais obtida', {
        novo: jobs.novo.length,
        emandamento: jobs.emandamento.length,
        encerrado: jobs.encerrado.length,
      });

      return jobs;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de editais', { err });
      throw err;
    }
  }
}
