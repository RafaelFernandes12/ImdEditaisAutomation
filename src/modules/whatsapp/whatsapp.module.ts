import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WhatsappService } from './services/whatsapp.service.js';
import { WhatsappController } from './controllers/whatsapp.controller.js';
import { UserModule } from '../user/user.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { LoginService } from './services/login.service.js';
import { GetJobsAndamento } from './services/getJobsAndamento.js';
import { FilesModule } from '../files/files.module.js';
import { AiChatModule } from '../ai_chat/ai_chat.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { DeactiveUser } from './services/deactiveUser.js';
import { ReactiveUser } from './services/reactiveUser.js';
import { GetNamesCitados } from './services/getNamesCitados.js';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    JobsModule,
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
    GetJobsAndamento,
    ReactiveUser,
    GetNamesCitados,
  ],
  controllers: [WhatsappController],
})
export class WhatsappModule {}
