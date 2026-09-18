import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ImdScraperService } from '../services/imd-scraper.service.js';
import { PdfExtractorService } from '../services/pdf-extractor.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { JerimunScraperService } from '../services/jerimun-scraper.service.js';

@Injectable()
export class GetNewJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private pdfExtractorService: PdfExtractorService,
    private readonly jerimunScraperService: JerimunScraperService,
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
      const editaisImdAndamento = await this.pdfExtractorService.execute(
        await this.imdScraperService.getImdEditaisEmAndamento(),
      );
      const jerimumJobs = await this.jerimunScraperService.execute();

      const editaisImdJobs = editaisImdAndamento.map((r) => ({
        ...r,
        isActive: true,
      }));
      const jobs = [...editaisImdJobs, ...jerimumJobs];
      await this.getNewJobs.addBulk(
        jobs.map((job) => ({ name: 'getNewJobs', data: job })),
      );

      this.logger.info(
        {
          evt: 'cron.get_new_jobs.done',
          cron: true,
          enqueued: jobs.length,
          enqueuedImd: editaisImdJobs.length,
          enqueuedJerimum: jerimumJobs.length,
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
