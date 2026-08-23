import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { WhatsappController } from './controllers/whatsapp.controller.js';
import { UserModule } from '../user/user.module.js';
import { EditalModule } from '../edital/edital.module.js';
import { LoginService } from './services/login.service.js';
import { GetEditaisAndamento } from './services/getEditaisAndamento.js';
import { FilesModule } from '../files/files.module.js';
import { AiChatModule } from '../ai_chat/ai_chat.module.js';

@Module({
  imports: [PrismaModule, UserModule, EditalModule, FilesModule, AiChatModule],
  exports: [WhatsappService],
  providers: [
    PrismaService,
    WhatsappService,
    LoginService,
    GetEditaisAndamento,
  ],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
