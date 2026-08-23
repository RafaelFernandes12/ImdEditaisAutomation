import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { EditaisScraperService } from '../services/editais-scraper.service.js';
import { PdfExtractorService } from '../services/pdf-extractor.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class GetNewEditaisProvider {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private pdfExtractorService: PdfExtractorService,

    @InjectQueue('getNewEditais') private getNewEditais: Queue,
    private readonly logger: Logger,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    this.logger.log('Start execute web-scrapping');

    const [resEmAndamento, resFinished] = await Promise.all([
      this.pdfExtractorService.execute(
        await this.editaisScraperService.getEditaisEmAndamento(),
      ),
      this.pdfExtractorService.execute(
        await this.editaisScraperService.getEditaisFinished(),
      ),
    ]);

    const editais = [
      ...resEmAndamento.map((r) => ({ ...r, isActive: true })),
      ...resFinished.map((r) => ({ ...r, isActive: false })),
    ].flatMap((v) => v.pdfs.flatMap((e) => ({ ...v, pdf: e })));

    await this.getNewEditais.addBulk(
      editais.map((edital) => ({ name: 'getNewEditais', data: edital })),
    );

    this.logger.log('Finish execute web-scrapping');
  }
}
