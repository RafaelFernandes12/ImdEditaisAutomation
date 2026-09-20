import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { JobType } from '../../../../generated/prisma/client.js';
import { JobWithPdfLinks } from './imd-scraper.service.js';

// A página pública (sti.ufrn.br) é uma SPA em Vue que consome esta API do
// WordPress — o HTML servido vem vazio, então lemos o JSON direto.
const API_BASE_URL =
  'https://webcache02-producao.info.ufrn.br/admin/sinfo/wp-json/wp/v2';
const EDITAIS_EM_ANDAMENTO_URL = `${API_BASE_URL}/editais-em-andamento`;
const PUBLIC_EDITAL_URL =
  'https://sti.ufrn.br/oportunidades/processos-seletivos-edital';

interface StiArquivo {
  title?: { rendered?: string | null };
  acf?: { anexo?: string | null };
}

interface StiEdital {
  id: number;
  title: { rendered: string };
  acf: {
    fim_das_inscricoes: string;
    arquivos?: StiArquivo[] | false | null;
  };
}

function decodeHtml(text: string) {
  return cheerio.load(text).text().trim();
}

@Injectable()
export class StiScraperService {
  constructor(
    @InjectPinoLogger(StiScraperService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getEditaisEmAndamento(): Promise<JobWithPdfLinks[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.sti.list.start', url: EDITAIS_EM_ANDAMENTO_URL },
      'Buscando listagem de editais da STI',
    );

    try {
      const response = await fetch(EDITAIS_EM_ANDAMENTO_URL);

      if (!response.ok) {
        this.logger.warn(
          { evt: 'scraper.sti.list.http_not_ok', status: response.status },
          'Listagem de editais da STI respondeu com status inesperado',
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
        this.logger.warn(
          { evt: 'scraper.sti.list.empty' },
          'Listagem da STI retornou zero editais',
        );
      }

      this.logger.info(
        {
          evt: 'scraper.sti.list.done',
          count: jobs.length,
          totalPdfLinks: jobs.reduce((acc, j) => acc + j.href.length, 0),
          durationMs: Date.now() - startedAt,
        },
        'Listagem de editais da STI obtida',
      );

      return jobs;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'scraper.sti.list.failed',
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao buscar a listagem de editais da STI',
      );
      throw error;
    }
  }
}
