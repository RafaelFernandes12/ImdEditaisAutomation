import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
    @InjectPinoLogger(PdfExtractorService.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(editaisUrl: EditaisUrl[]) {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'pdf_extract.batch_start', count: editaisUrl.length },
      'Iniciando download e extração de PDFs',
    );

    const editais = await this.editaisScraperService.getEditaisPdfs(editaisUrl);

    let downloaded = 0;
    let skipped = 0;

    const result = await Promise.all(
      editais.map(async (edital) => {
        const pdfs = await Promise.all(
          edital.href.map(async (e) => {
            const foundLink = await this.pdfService.findByLink(e.link);
            if (foundLink) {
              skipped += 1;

              this.logger.debug(
                {
                  evt: 'pdf_extract.skipped_existing',
                  pdfLink: e.link,
                  pdfLabel: e.label,
                },
                'PDF já existe no banco, pulando download',
              );
              return;
            }

            const pdfStartedAt = Date.now();

            try {
              const download = await fetch(e.link);

              if (!download.ok) {
                this.logger.warn(
                  {
                    evt: 'pdf_extract.download.http_not_ok',
                    status: download.status,
                    pdfLink: e.link,
                    pdfLabel: e.label,
                  },
                  'Download do PDF respondeu com status inesperado',
                );
              }

              const buffer = Buffer.from(await download.arrayBuffer());
              const downloadedAt = Date.now();

              const parser = new PDFParse({ data: buffer });
              const { text } = await parser.getText();

              downloaded += 1;

              this.logger.info(
                {
                  evt: 'pdf_extract.done',
                  pdfLink: e.link,
                  pdfLabel: e.label,
                  editalTitle: edital.title,
                  bytes: buffer.byteLength,
                  textLength: text.length,
                  downloadMs: downloadedAt - pdfStartedAt,
                  parseMs: Date.now() - downloadedAt,
                  durationMs: Date.now() - pdfStartedAt,
                },
                'PDF baixado e extraído',
              );

              if (text.length === 0) {
                this.logger.warn(
                  {
                    evt: 'pdf_extract.empty_text',
                    pdfLink: e.link,
                    pdfLabel: e.label,
                    bytes: buffer.byteLength,
                  },
                  'PDF sem texto extraível — provável documento escaneado',
                );
              }

              return { ...e, text };
            } catch (error: unknown) {
              this.logger.error(
                {
                  evt: 'pdf_extract.failed',
                  pdfLink: e.link,
                  pdfLabel: e.label,
                  editalTitle: edital.title,
                  durationMs: Date.now() - pdfStartedAt,
                  err: error,
                },
                'Falha ao baixar ou extrair o PDF',
              );
              throw error;
            }
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

    const editaisWithNoNewPdfs = result.filter(
      (r) => r.pdfs.length === 0,
    ).length;

    this.logger.info(
      {
        evt: 'pdf_extract.batch_done',
        count: result.length,
        downloaded,
        skipped,
        editaisWithNoNewPdfs,
        durationMs: Date.now() - startedAt,
      },
      'Extração de PDFs concluída',
    );

    return result;
  }
}
