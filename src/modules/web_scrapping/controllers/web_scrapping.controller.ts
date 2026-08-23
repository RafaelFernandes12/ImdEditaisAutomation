import { Controller, Get } from '@nestjs/common';
import { NotifyHomologProvider } from '../providers/notify-homologados.provider.js';
import { NotifyNewEditaisProvider } from '../providers/notify-new-editais.provider.js';
import { GetNewEditaisProvider } from '../providers/get-new-editais.provider.js';

@Controller('editais')
export class WebScrappingController {
  constructor(
    private readonly notifyHomologService: NotifyHomologProvider,
    private readonly notifyNewEditaisProvider: NotifyNewEditaisProvider,
    private readonly getNewEditaisProvider: GetNewEditaisProvider,
  ) {}

  @Get('/new')
  async getPdfs() {
    return await this.notifyHomologService.execute();
  }

  @Get('/notifyNewEditais')
  async notifyNewEditais() {
    return await this.notifyNewEditaisProvider.execute();
  }

  @Get('/getNewEditaisProvider')
  async getNewEditais() {
    return await this.getNewEditaisProvider.execute();
  }
}
