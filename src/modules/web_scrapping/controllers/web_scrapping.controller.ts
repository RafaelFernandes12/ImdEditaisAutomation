import { Controller, Get } from '@nestjs/common';
import { WebScrappingService } from '../services/web-scrapping.service.js';

@Controller('editais')
export class WebScrappingController {
  constructor(private readonly webscrapping: WebScrappingService) {}

  @Get('/')
  async getEditais() {
    return await this.webscrapping.execute();
  }
}
