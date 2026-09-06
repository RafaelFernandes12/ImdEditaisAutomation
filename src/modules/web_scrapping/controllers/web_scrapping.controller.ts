import { Controller, Get } from '@nestjs/common';
import { NotifyHomologProvider } from '../providers/notify-homologados.provider.js';
import { NotifyNewEditaisProvider } from '../providers/notify-new-editais.provider.js';
import { GetNewEditaisProvider } from '../providers/get-new-editais.provider.js';
import { NotifyPdfsProvider } from '../providers/notify-pdfs.provider.js';

@Controller('editais')
export class WebScrappingController {
  constructor(
    private readonly notifyHomologService: NotifyHomologProvider,
    private readonly notifyNewEditaisProvider: NotifyNewEditaisProvider,
    private readonly getNewEditaisProvider: GetNewEditaisProvider,
    private readonly notifyPdfsProvider: NotifyPdfsProvider,
  ) {}

  @Get('/notifyPdfs')
  async notifyResultado() {
    return await this.notifyPdfsProvider.execute();
  }
  @Get('/notifyHomolog')
  async getPdfs() {
    return await this.notifyHomologService.execute();
  }

  @Get('/notifyNewEditais')
  async notifyNewEditais() {
    return await this.notifyNewEditaisProvider.execute();
  }

  @Get('/getNewEditais')
  async getNewEditais() {
    return await this.getNewEditaisProvider.execute();
  }
}
