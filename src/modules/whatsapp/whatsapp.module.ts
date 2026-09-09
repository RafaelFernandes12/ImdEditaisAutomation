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
import { PdfModule } from '../pdf/pdf.module.js';
import { DeactiveUser } from './services/deactiveUser.js';
import { ReactiveUser } from './services/reactiveUser.js';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    EditalModule,
    FilesModule,
    AiChatModule,
    PdfModule,
  ],
  exports: [WhatsappService],
  providers: [
    PrismaService,
    WhatsappService,
    DeactiveUser,
    LoginService,
    GetEditaisAndamento,
    ReactiveUser,
    DeactiveUser,
  ],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
