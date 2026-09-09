import { Controller, Get } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NotifyNewEditaisProvider } from '../providers/notify-new-editais.provider.js';
import { GetNewEditaisProvider } from '../providers/get-new-editais.provider.js';
import { NotifyPdfsProvider } from '../providers/notify-pdfs.provider.js';
import { FinishEditaisProvider } from '../providers/finish-editais.provider.js';

@Controller('editais')
export class WebScrappingController {
  constructor(
    private readonly notifyNewEditaisProvider: NotifyNewEditaisProvider,
    private readonly getNewEditaisProvider: GetNewEditaisProvider,
    private readonly notifyPdfsProvider: NotifyPdfsProvider,
    private readonly finishEditaisProvider: FinishEditaisProvider,
    @InjectPinoLogger(WebScrappingController.name)
    private readonly logger: PinoLogger,
  ) {}

  private trigger(provider: string) {
    this.logger.info(
      { evt: 'web_scrapping.manual_trigger', provider, cron: false },
      'Execução disparada manualmente via HTTP',
    );
  }

  @Get('/finishEditais')
  async finishEditais() {
    this.trigger('finishEditais');
    return await this.finishEditaisProvider.execute();
  }

  @Get('/notifyPdfs')
  async notifyResultado() {
    this.trigger('notifyPdfs');
    return await this.notifyPdfsProvider.execute();
  }

  @Get('/notifyNewEditais')
  async notifyNewEditais() {
    this.trigger('notifyNewEditais');
    return await this.notifyNewEditaisProvider.execute();
  }

  @Get('/getNewEditais')
  async getNewEditais() {
    this.trigger('getNewEditais');
    return await this.getNewEditaisProvider.execute();
  }
}
