import { Controller, Get } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../services/jobs.service.js';
import { ScopedLogger } from '#src/utils/scoped-logger.js';

@Controller('job')
export class JobsController {
  constructor(
    @InjectPinoLogger(JobsController.name)
    private readonly logger: PinoLogger,
    private readonly jobsService: JobsService,
  ) {}

  private trigger(provider: string) {
    new ScopedLogger(this.logger, 'web_scrapping', { cron: false }).info(
      'manual_trigger',
      'Execução disparada manualmente via HTTP',
      { provider },
    );
  }

  @Get('/getJobs')
  async getJobs() {
    this.trigger('finishJobs');
    return await this.jobsService.findActive();
  }
}
