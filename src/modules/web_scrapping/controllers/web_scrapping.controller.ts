import { Controller, Get } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NotifyNewJobsProvider } from '../providers/notify-new-jobs.provider.js';
import { GetNewJobsProvider } from '../providers/get-new-jobs.provider.js';
import { NotifyPdfsProvider } from '../providers/notify-pdfs.provider.js';
import { FinishJobsProvider } from '../providers/finish-jobs.provider.js';
import { JerimunScraperService } from '../services/jerimun-scraper.service.js';

@Controller('jobs')
export class WebScrappingController {
  constructor(
    private readonly notifyNewJobsProvider: NotifyNewJobsProvider,
    private readonly getNewJobsProvider: GetNewJobsProvider,
    private readonly jerimunScraperService: JerimunScraperService,
    private readonly notifyPdfsProvider: NotifyPdfsProvider,
    private readonly finishJobsProvider: FinishJobsProvider,
    @InjectPinoLogger(WebScrappingController.name)
    private readonly logger: PinoLogger,
  ) {}

  private trigger(provider: string) {
    this.logger.info(
      { evt: 'web_scrapping.manual_trigger', provider, cron: false },
      'Execução disparada manualmente via HTTP',
    );
  }

  @Get('/finishJobs')
  async getJerimumJobs() {
    this.trigger('finishJobs');
    return await this.finishJobsProvider.execute();
  }
  @Get('/jerimumJobs')
  async finishJobs() {
    this.trigger('jerimumJobs');
    return await this.jerimunScraperService.execute();
  }

  @Get('/notifyPdfs')
  async notifyResultado() {
    this.trigger('notifyPdfs');
    return await this.notifyPdfsProvider.execute();
  }

  @Get('/notifyNewJobs')
  async notifyNewJobs() {
    this.trigger('notifyNewJobs');
    return await this.notifyNewJobsProvider.execute();
  }

  @Get('/getNewJobs')
  async getNewJobs() {
    this.trigger('getNewJobs');
    return await this.getNewJobsProvider.execute();
  }
}
