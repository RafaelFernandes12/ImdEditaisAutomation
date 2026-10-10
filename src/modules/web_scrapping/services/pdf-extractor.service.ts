import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PDFParse } from 'pdf-parse';
import { PdfService } from '../../pdf/services/pdf.service.js';
import {
  ImdScraperService,
  JobUrl,
  JobWithPdfLinks,
} from './imd-scraper.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class PdfExtractorService {
  constructor(
    private imdScraperService: ImdScraperService,
    private pdfService: PdfService,
    @InjectPinoLogger(PdfExtractorService.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(jobsUrl: JobUrl[]) {
    return this.extractPdfs(await this.imdScraperService.getJobsPdfs(jobsUrl));
  }

  async extractPdfs(jobs: JobWithPdfLinks[]) {
    const log = new ScopedLogger(this.logger, 'pdf_extract');
    const timer = log.start(
      'batch_start',
      'Iniciando download e extração de PDFs',
      { count: jobs.length },
    );

    let downloaded = 0;
    let skipped = 0;

    const result = await Promise.all(
      jobs.map(async (job) => {
        const pdfs = await Promise.all(
          job.href.map(async (e) => {
            const pdfLog = log.child({
              pdfLink: e.link,
              pdfLabel: e.label,
              jobTitle: job.title,
            });
            const foundLink = await this.pdfService.findByLink(e.link);
            if (foundLink) {
              skipped += 1;

              pdfLog.debug(
                'skipped_existing',
                'PDF já existe no banco, pulando download',
              );
              return;
            }

            const pdfStartedAt = Date.now();
            const pdfTimer = pdfLog.timed();

            try {
              const download = await fetch(e.link);

              if (!download.ok) {
                pdfLog.warn(
                  'download.http_not_ok',
                  'Download do PDF respondeu com status inesperado',
                  { status: download.status },
                );
              }

              const buffer = Buffer.from(await download.arrayBuffer());
              const downloadedAt = Date.now();

              const parser = new PDFParse({ data: buffer });
              const { text } = await parser.getText();

              downloaded += 1;

              pdfTimer.info('done', 'PDF baixado e extraído', {
                bytes: buffer.byteLength,
                textLength: text.length,
                downloadMs: downloadedAt - pdfStartedAt,
                parseMs: Date.now() - downloadedAt,
              });

              if (text.length === 0) {
                pdfLog.warn(
                  'empty_text',
                  'PDF sem texto extraível — provável documento escaneado',
                  { bytes: buffer.byteLength },
                );
              }

              return { ...e, text };
            } catch (err: unknown) {
              pdfTimer.error('failed', 'Falha ao baixar ou extrair o PDF', {
                err,
              });
              throw err;
            }
          }),
        );

        return {
          title: job.title,
          type: job.type,
          link: job.link,
          subscriptionUntil: job.subscriptionUntil,
          pdfs: pdfs.filter((p) => p !== undefined),
        };
      }),
    );

    const jobsWithNoNewPdfs = result.filter((r) => r.pdfs.length === 0).length;

    timer.info('batch_done', 'Extração de PDFs concluída', {
      count: result.length,
      downloaded,
      skipped,
      jobsWithNoNewPdfs,
    });

    return result;
  }
}
