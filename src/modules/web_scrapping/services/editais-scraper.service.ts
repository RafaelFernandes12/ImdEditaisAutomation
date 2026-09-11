import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { formatDateBrToUs } from '#src/utils/formate-date.js';

const SITE_BASE_URL = 'https://www.metropoledigital.ufrn.br';
const EDITAIS_LIST_URL = `${SITE_BASE_URL}/portal/editais`;

export interface EditaisUrl {
  href: string;
  badge: string;
  title: string;
  subscriptionUntil: Date;
}

export interface EditalPdfLink {
  label: string;
  link: string;
}

export interface EditalWithPdfLinks extends Omit<EditaisUrl, 'href'> {
  link: string;
  href: EditalPdfLink[];
}

@Injectable()
export class EditaisScraperService {
  constructor(
    private readonly pdfService: PdfService,
    @InjectPinoLogger(EditaisScraperService.name)
    private readonly logger: PinoLogger,
  ) {}

  async getEditaisEmAndamento(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-andamentos', 'em_andamento');
  }

  async getEditaisFinished(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-encerrados', 'encerrados');
  }

  async getEditaisPdfs(
    editaisUrl: EditaisUrl[],
  ): Promise<EditalWithPdfLinks[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.pdf_links.batch_start', count: editaisUrl.length },
      'Buscando links de PDF dos editais',
    );

    const result = await Promise.all(
      editaisUrl.map(async (url) => {
        const editalStartedAt = Date.now();

        try {
          const edital = await fetch(url.href);

          if (!edital.ok) {
            this.logger.warn(
              {
                evt: 'scraper.edital_page.http_not_ok',
                status: edital.status,
                editalUrl: url.href,
                editalTitle: url.title,
              },
              'Página do edital respondeu com status inesperado',
            );
          }

          const editalHTML = await edital.text();

          const $editaisLoaded = cheerio.load(editalHTML);

          const editalRow = $editaisLoaded('table.tb_noticias tr');

          const downloadHref = editalRow
            .find('a')
            .map((i, el) => ({
              label: $editaisLoaded(el)
                .closest('tr')
                .find('td')
                .eq(1)
                .text()
                .trim(),
              link: `${SITE_BASE_URL}${$editaisLoaded(el).attr('href')}`,
            }))
            .get();

          if (downloadHref.length === 0) {
            this.logger.warn(
              {
                evt: 'scraper.pdf_links.empty',
                editalUrl: url.href,
                editalTitle: url.title,
                rowCount: editalRow.length,
              },
              'Nenhum link de PDF encontrado na página do edital',
            );
          }

          this.logger.debug(
            {
              evt: 'scraper.pdf_links.found',
              editalUrl: url.href,
              editalTitle: url.title,
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
              evt: 'scraper.edital_page.done',
              editalUrl: url.href,
              editalTitle: url.title,
              count: downloadHref.length,
              durationMs: Date.now() - editalStartedAt,
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
              evt: 'scraper.edital_page.failed',
              editalUrl: url.href,
              editalTitle: url.title,
              durationMs: Date.now() - editalStartedAt,
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

  private async getEditais(
    boxName: string,

    listType: 'em_andamento' | 'encerrados',
  ): Promise<EditaisUrl[]> {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'scraper.list.start', listType, url: EDITAIS_LIST_URL },
      'Buscando listagem de editais',
    );

    try {
      const editais = await fetch(EDITAIS_LIST_URL);

      if (!editais.ok) {
        this.logger.warn(
          {
            evt: 'scraper.list.http_not_ok',
            listType,
            status: editais.status,
          },
          'Listagem de editais respondeu com status inesperado',
        );
      }

      const editaisHTML = await editais.text();
      const $editaisLoaded = cheerio.load(editaisHTML);

      const editaisHref: EditaisUrl[] = $editaisLoaded(boxName)
        .find('a')
        .map((_, el) => ({
          href: `${SITE_BASE_URL}${$editaisLoaded(el).attr('href')}`,
          badge: $editaisLoaded(el).find('.badge').first().text(),
          title: $editaisLoaded(el).find('h5').text(),
          subscriptionUntil: formatDateBrToUs(
            $editaisLoaded(el).find('p').text().trim().substring(15, 25),
          ),
        }))
        .get();

      if (editaisHref.length === 0) {
        this.logger.warn(
          {
            evt: 'scraper.list.empty',
            listType,
            boxName,
            htmlLength: editaisHTML.length,
          },
          'Listagem retornou zero editais — possível mudança no HTML do site',
        );
      }

      this.logger.info(
        {
          evt: 'scraper.list.done',
          listType,
          count: editaisHref.length,
          htmlLength: editaisHTML.length,
          durationMs: Date.now() - startedAt,
        },
        'Listagem de editais obtida',
      );

      return editaisHref;
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
