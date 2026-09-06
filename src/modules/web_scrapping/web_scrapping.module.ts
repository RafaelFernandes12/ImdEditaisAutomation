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
import { NotifyNewEditaisConsumer } from './providers/notify-new-editais.consumer.js';
import { BullModule } from '@nestjs/bullmq';
import { GetNewEditaisProvider } from './providers/get-new-editais.provider.js';
import { GetNewEditaisConsumer } from './providers/get-new-editais.consumer.js';
import { FinishEditaisProvider } from './providers/finish-editais.provider.js';
import { AiChatModule } from '../ai_chat/ai_chat.module.js';
import { NotifyPdfsProvider } from './providers/notify-pdfs.provider.js';
import { NotifyNewPdf } from './providers/notify-pdfs.consumer.js';
import { SendsModule } from '../sends/sends.module.js';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    EditalModule,
    AiChatModule,
    PdfModule,
    SendsModule,
    BullModule.registerQueue({ name: 'sendPdf' }),
    BullModule.registerQueue({ name: 'notifyNewEditais' }),
    BullModule.registerQueue({ name: 'getNewEditais' }),
  ],
  providers: [
    PrismaService,
    FinishEditaisProvider,
    EditaisScraperService,
    PdfExtractorService,
    NotifyNewEditaisProvider,
    NotifyNewEditaisConsumer,
    NotifyPdfsProvider,
    NotifyNewPdf,
    GetNewEditaisProvider,
    GetNewEditaisConsumer,
  ],
  controllers: [WebScrappingController],
})
export class WebScrappingModule {}
