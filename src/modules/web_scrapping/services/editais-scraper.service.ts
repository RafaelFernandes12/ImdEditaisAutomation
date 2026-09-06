import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PdfService } from '../../pdf/services/pdf.service.js';

export interface EditaisUrl {
  href: string;
  badge: string;
  title: string;
  subscriptionUntil: string;
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
  constructor(private readonly pdfService: PdfService) {}
  async getEditaisEmAndamento(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-andamentos');
  }

  async getEditaisFinished(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-encerrados');
  }

  async getEditaisPdfs(
    editaisUrl: EditaisUrl[],
  ): Promise<EditalWithPdfLinks[]> {
    return Promise.all(
      editaisUrl.map(async (url) => {
        const edital = await fetch(url.href);
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
            link: `https://www.metropoledigital.ufrn.br${$editaisLoaded(el).attr('href')}`,
          }))
          .get();

        console.log('DOWNLOADHREF', downloadHref);
        downloadHref.filter(
          (download) => this.pdfService.findByLink(download.link) === undefined,
        );

        console.log('DOWNLOADHREF', downloadHref);
        return {
          ...url,
          link: url.href,
          href: downloadHref,
        };
      }),
    );
  }

  private async getEditais(boxName: string): Promise<EditaisUrl[]> {
    const editais = await fetch(
      'https://www.metropoledigital.ufrn.br/portal/editais',
    );
    const editaisHTML = await editais.text();
    const $editaisLoaded = cheerio.load(editaisHTML);

    const editaisHref: EditaisUrl[] = $editaisLoaded(boxName)
      .find('a')
      .map((_, el) => ({
        href: `https://www.metropoledigital.ufrn.br${$editaisLoaded(el).attr('href')}`,
        badge: $editaisLoaded(el).find('.badge').text(),
        title: $editaisLoaded(el).find('h5').text(),
        subscriptionUntil: $editaisLoaded(el)
          .find('p')
          .text()
          .trim()
          .substring(0, 25),
      }))
      .get();

    return editaisHref;
  }
}
