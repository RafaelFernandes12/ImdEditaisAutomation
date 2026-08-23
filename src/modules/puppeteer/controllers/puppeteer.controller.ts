import { Controller, Get } from '@nestjs/common';
import { PuppeteerService } from '../services/puppeteer.service.js';

@Controller('puppeteer')
export class PuppeteerController {
  constructor(private readonly puppeteerService: PuppeteerService) {}

  @Get()
  findAll() {
    return this.puppeteerService.execute();
  }
}
