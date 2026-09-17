import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ImdScraperService } from '../services/imd-scraper.service.js';
import { PdfExtractorService } from '../services/pdf-extractor.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class GetNewJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private pdfExtractorService: PdfExtractorService,

    @InjectQueue('getNewJobs') private getNewJobs: Queue,
    @InjectPinoLogger(GetNewJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron('0 8,17 * * 1-5', { timeZone: 'America/Sao_Paulo' })
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.get_new_jobs.start', cron: true },
      'Iniciando coleta de novos editais',
    );

    try {
      const resEmAndamento = await this.pdfExtractorService.execute(
        await this.imdScraperService.getJobsEmAndamento(),
      );

      const jobs = resEmAndamento.map((r) => ({ ...r, isActive: true }));
      await this.getNewJobs.addBulk(
        jobs.map((job) => ({ name: 'getNewJobs', data: job })),
      );

      this.logger.info(
        {
          evt: 'cron.get_new_jobs.done',
          cron: true,
          enqueued: jobs.length,
          durationMs: Date.now() - startedAt,
        },
        'Coleta de novos editais finalizada',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.get_new_jobs.failed',
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
