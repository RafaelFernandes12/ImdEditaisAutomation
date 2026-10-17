import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { JobType } from '../../../../generated/prisma/client.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobWithPdfLinks, StiEdital } from '../models/sources.js';
import { PdfExtractorService } from '../utils/pdf-extractor.service.js';
import { JobSource, SourceWeight } from './job.source.js';
import { EditalJobPayload } from '../strategy/new-job.strategy.js';

// A página pública (sti.ufrn.br) é uma SPA em Vue que consome esta API do
// WordPress — o HTML servido vem vazio, então lemos o JSON direto.
const API_BASE_URL =
  'https://webcache02-producao.info.ufrn.br/admin/sinfo/wp-json/wp/v2';
const EDITAIS_EM_ANDAMENTO_URL = `${API_BASE_URL}/editais-em-andamento`;
const PUBLIC_EDITAL_URL =
  'https://sti.ufrn.br/oportunidades/processos-seletivos-edital';

function decodeHtml(text: string) {
  return cheerio.load(text).text().trim();
}

@Injectable()
export class StiSource implements JobSource<JobWithPdfLinks> {
  readonly name = 'sti';
  readonly types: JobType[] = ['STI'];
  readonly weight: SourceWeight = [
    [
      this.types[0],
      {
        ecossytem: 55,
        escolaridade: 10,
        salary: 5,
        formato: 10,
        city: 0,
        modelo: 10,
        senioridade: 10,
        priority: 1.4,
      },
    ],
  ];
  constructor(
    @InjectPinoLogger(StiSource.name)
    private readonly logger: PinoLogger,
    private readonly pdfExtractorService: PdfExtractorService,
  ) {}

  async list(): Promise<JobWithPdfLinks[]> {
    return await this.getEditaisEmAndamento();
  }

  async fetchDetails(jobs: JobWithPdfLinks[]): Promise<EditalJobPayload[]> {
    const editais = await this.pdfExtractorService.extractPdfs(jobs);
    return editais.map((edital) => ({
      ...edital,
      type: 'STI',
      isActive: true,
    }));
  }

  private async getEditaisEmAndamento(): Promise<JobWithPdfLinks[]> {
    const log = new ScopedLogger(this.logger, 'scraper.sti.list', {
      url: EDITAIS_EM_ANDAMENTO_URL,
    });

    const timer = log.start('start', 'Buscando listagem de editais da STI');

    try {
      const response = await fetch(EDITAIS_EM_ANDAMENTO_URL);

      if (!response.ok) {
        log.warn(
          'http_not_ok',
          'Listagem de editais da STI respondeu com status inesperado',
          { status: response.status },
        );
      }

      const editais = (await response.json()) as StiEdital[];

      const jobs: JobWithPdfLinks[] = editais.map((edital) => ({
        title: decodeHtml(edital.title.rendered),
        type: JobType.STI,
        link: `${PUBLIC_EDITAL_URL}/${edital.id}`,
        subscriptionUntil: new Date(
          `${edital.acf.fim_das_inscricoes}T23:59:59-03:00`,
        ),
        href: (edital.acf.arquivos || [])
          .filter((arquivo) => arquivo.acf?.anexo)
          .map((arquivo) => ({
            label: decodeHtml(arquivo.title?.rendered ?? ''),
            // new URL() codifica caracteres não-ASCII sem duplicar os %XX já presentes
            link: new URL(arquivo.acf!.anexo!).href,
          })),
      }));

      if (jobs.length === 0) {
        log.warn('empty', 'Listagem da STI retornou zero editais');
      }

      timer.info('done', 'Listagem de editais da STI obtida', {
        count: jobs.length,
        totalPdfLinks: jobs.reduce((acc, j) => acc + j.href.length, 0),
      });

      return jobs;
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao buscar a listagem de editais da STI', {
        err,
      });
      throw err;
    }
  }
}
