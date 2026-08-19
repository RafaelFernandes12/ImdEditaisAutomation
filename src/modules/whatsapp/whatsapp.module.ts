import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { WebScrappingController } from './controllers/whatsapp.controller.js';
import { WhatsappRepository } from './repositories/whatsapp.repository.js';
import { UserModule } from '../user/user.module.js';
import { LoginService } from './services/login.service.js';
import { GetEditaisAndamento } from './services/getEditaisAndamento.js';

@Module({
  imports: [PrismaModule, UserModule],
  exports: [WhatsappService],
  providers: [
    PrismaService,
    WhatsappService,
    WhatsappRepository,
    LoginService,
    GetEditaisAndamento,
  ],
  controllers: [WebScrappingController],
})
export class WhatsappModule {}
