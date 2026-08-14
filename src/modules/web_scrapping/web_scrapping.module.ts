import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WebScrappingService } from './services/web-scrapping.service.js';
import { WebScrappingController } from './controllers/web_scrapping.controller.js';
import { WebScrappingRepository } from './repositories/web-scrapping.repository.js';
import { UserModule } from '../user/user.module.js';
import { WhatsappRepository } from '../whatsapp/repositories/whatsapp.repository.js';
import { WhatsappModule } from '../whatsapp/whatsapp.module.js';

@Module({
  imports: [PrismaModule, UserModule, WhatsappModule],
  exports: [WebScrappingService],
  providers: [
    PrismaService,
    WebScrappingService,
    WebScrappingRepository,
    WhatsappRepository,
  ],
  controllers: [WebScrappingController],
})
export class WebScrappingModule {}
