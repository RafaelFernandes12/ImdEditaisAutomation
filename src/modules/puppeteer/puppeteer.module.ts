import { Module } from '@nestjs/common';
import { PuppeteerService } from './services/puppeteer.service.js';
import { PuppeteerController } from './controllers/puppeteer.controller.js';

@Module({
  providers: [PuppeteerService],
  controllers: [PuppeteerController],
})
export class PuppeteerModule {}
