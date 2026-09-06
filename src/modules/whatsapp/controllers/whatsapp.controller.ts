import { Controller, Get } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service.js';

@Controller('wpp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}
  //
  // @Get('/')
  // getQrCode() {
  //   this.whatsappService.execute();
  // }
}
