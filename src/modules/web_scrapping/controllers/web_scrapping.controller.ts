import { Controller, Get } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NotifyNewJobsProvider } from '../providers/notify-new-jobs.provider.js';
import { GetNewJobsProvider } from '../providers/get-new-jobs.provider.js';
import { NotifyPdfsProvider } from '../providers/notify-pdfs.provider.js';
import { FinishJobsProvider } from '../providers/finish-jobs.provider.js';
import { JerimunSource } from '../sources/jerimun.source.js';
import { GithubSource } from '../sources/github.source.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { ImdSource } from '../sources/imd.source.js';
import { LaisSource } from '../sources/lais.source.js';
import { FunpecSource } from '../sources/funpec.source.js';
import { EctSource } from '../sources/ect.source.js';
import { StiSource } from '../sources/sti.source.js';
import { GupySource } from '../sources/gupy.source.js';
import { LinkedinSource } from '../sources/linkedin.source.js';
import { InfojobsSource } from '../sources/infojobs.source.js';

@Controller('jobs')
export class WebScrappingController {
  constructor(
    private readonly notifyNewJobsProvider: NotifyNewJobsProvider,
    private readonly githubSource: GithubSource,
    private readonly getNewJobsProvider: GetNewJobsProvider,
    private readonly jerimunSource: JerimunSource,
    private readonly notifyPdfsProvider: NotifyPdfsProvider,
    private readonly finishJobsProvider: FinishJobsProvider,
    @InjectPinoLogger(WebScrappingController.name)
    private readonly logger: PinoLogger,
    private readonly imdSource: ImdSource,
    private readonly laisSource: LaisSource,
    private readonly funpecSource: FunpecSource,
    private readonly ectSource: EctSource,
    private readonly stiSource: StiSource,
    private readonly gupySource: GupySource,
    private readonly linkedinSource: LinkedinSource,
    private readonly infojobsSource: InfojobsSource,
  ) {}

  private trigger(provider: string) {
    new ScopedLogger(this.logger, 'web_scrapping', { cron: false }).info(
      'manual_trigger',
      'Execução disparada manualmente via HTTP',
      { provider },
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
    return await this.getNewJobsProvider.collect(this.jerimunSource);
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

  @Get('/githubJobs')
  async githubJobs() {
    this.trigger('githubJobs');
    return await this.getNewJobsProvider.collect(this.githubSource);
  }
  @Get('/getNewJobs')
  async getNewJobs() {
    this.trigger('getNewJobs');
    return await this.getNewJobsProvider.execute();
  }

  @Get('/getImdSource')
  async getImdSource() {
    this.trigger('getImdSource');
    return await this.getNewJobsProvider.collect(this.imdSource);
  }

  @Get('/getLaisSource')
  async getLaisSource2() {
    this.trigger('getLaisSource');
    return await this.getNewJobsProvider.collect(this.laisSource);
  }

  @Get('/getFunpecSource')
  async getFunpecSource() {
    this.trigger('getFunpecSource');
    return await this.getNewJobsProvider.collect(this.funpecSource);
  }

  @Get('/getEctSource')
  async getEctSource() {
    this.trigger('getEctSource');
    return await this.getNewJobsProvider.collect(this.ectSource);
  }

  @Get('/getStiSource')
  async getStiSource() {
    this.trigger('getStiSource');
    return await this.getNewJobsProvider.collect(this.stiSource);
  }

  @Get('/getGupySource')
  async getGupySource() {
    this.trigger('getGupySource');
    return await this.getNewJobsProvider.collect(this.gupySource);
  }

  @Get('/getLinkedinSource')
  async getLinkedinSource() {
    this.trigger('getLinkedinSource');
    return await this.getNewJobsProvider.collect(this.linkedinSource);
  }

  @Get('/getInfojobsSource')
  async getInfojobsSource() {
    this.trigger('getInfojobsSource');
    return await this.getNewJobsProvider.collect(this.infojobsSource);
  }
}
