import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
    @InjectPinoLogger(GetNewEditaisProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.get_new_editais.start', cron: true },
      'Iniciando coleta de novos editais',
    );

    try {
      const resEmAndamento = await this.pdfExtractorService.execute(
        await this.editaisScraperService.getEditaisEmAndamento(),
      );

      const editais = resEmAndamento.map((r) => ({ ...r, isActive: true }));
      await this.getNewEditais.addBulk(
        editais.map((edital) => ({ name: 'getNewEditais', data: edital })),
      );

      this.logger.info(
        {
          evt: 'cron.get_new_editais.done',
          cron: true,
          enqueued: editais.length,
          durationMs: Date.now() - startedAt,
        },
        'Coleta de novos editais finalizada',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.get_new_editais.failed',
          cron: true,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha na coleta de novos editais',
      );
      throw error;
    }
  }
}
