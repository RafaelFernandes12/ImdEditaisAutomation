import { Injectable } from '@nestjs/common';
import { PDFParse } from 'pdf-parse';
import { PdfService } from '../../pdf/services/pdf.service.js';
import {
  EditaisScraperService,
  EditaisUrl,
} from './editais-scraper.service.js';

@Injectable()
export class PdfExtractorService {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private pdfService: PdfService,
  ) {}

  async execute(editaisUrl: EditaisUrl[]) {
    const editais = await this.editaisScraperService.getEditaisPdfs(editaisUrl);

    return Promise.all(
      editais.map(async (edital) => {
        const pdfs = await Promise.all(
          edital.href.map(async (e) => {
            const foundLink = await this.pdfService.findByLink(e.link);
            if (foundLink) return;
            const download = await fetch(e.link);
            const buffer = Buffer.from(await download.arrayBuffer());
            const parser = new PDFParse({ data: buffer });
            const { text } = await parser.getText();

            return { ...e, text };
          }),
        );
        return {
          badge: edital.badge,
          title: edital.title,
          link: edital.link,
          subscriptionUntil: edital.subscriptionUntil,
          pdfs: pdfs.filter((p) => p !== undefined),
        };
      }),
    );
  }
}
