import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WebScrappingController } from './controllers/web_scrapping.controller.js';
import { UserModule } from '../user/user.module.js';
import { EditalModule } from '../edital/edital.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { EditaisScraperService } from './services/editais-scraper.service.js';
import { PdfExtractorService } from './services/pdf-extractor.service.js';
import { NotifyNewEditaisProvider } from './providers/notify-new-editais.provider.js';
import { NotifyHomologProvider } from './providers/notify-homologados.provider.js';
import { BullModule } from '@nestjs/bullmq';
import { PdfSendsModule } from '../pdf_sends/pdf_sends.module.js';
import { GetNewEditaisProvider } from './providers/get-new-editais.provider.js';
import { GetNewEditaisConsumer } from './providers/get-new-editais.consumer.js';
import { FinishEditaisProvider } from './providers/finish-editais.provider.js';
import { EditalToUserModule } from '../edital_to_user/edital_to_user.module.js';
import { AiChatModule } from '../ai_chat/ai_chat.module.js';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    EditalModule,
    AiChatModule,
    EditalToUserModule,
    PdfModule,
    PdfSendsModule,
    BullModule.registerQueue({ name: 'scanHomolog' }),
    BullModule.registerQueue({ name: 'notifyNewEditais' }),
    BullModule.registerQueue({ name: 'getNewEditais' }),
  ],
  providers: [
    PrismaService,
    FinishEditaisProvider,
    EditaisScraperService,
    PdfExtractorService,
    NotifyNewEditaisProvider,
    GetNewEditaisProvider,
    GetNewEditaisConsumer,
    NotifyHomologProvider,
  ],
  controllers: [WebScrappingController],
})
export class WebScrappingModule {}
