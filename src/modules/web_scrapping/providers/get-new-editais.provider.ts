import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { EditaisScraperService } from '../services/editais-scraper.service.js';
import { PdfExtractorService } from '../services/pdf-extractor.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GetNewEditaisProvider {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private pdfExtractorService: PdfExtractorService,

    @InjectQueue('getNewEditais') private getNewEditais: Queue,
    private readonly logger: Logger,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async execute() {
    this.logger.log('Start execute web-scrapping');

    const resEmAndamento = await this.pdfExtractorService.execute(
      await this.editaisScraperService.getEditaisEmAndamento(),
    );

    const editais = resEmAndamento.map((r) => ({ ...r, isActive: true }));
    await this.getNewEditais.addBulk(
      editais.map((edital) => ({ name: 'getNewEditais', data: edital })),
    );

    this.logger.log('Finish execute web-scrapping');
  }
}
