import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WebScrappingController } from './controllers/web_scrapping.controller.js';
import { UserModule } from '../user/user.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { ImdScraperService } from './services/imd-scraper.service.js';
import { PdfExtractorService } from './services/pdf-extractor.service.js';
import { NotifyNewJobsProvider } from './providers/notify-new-jobs.provider.js';
import { NotifyNewJobsConsumer } from './providers/notify-new-jobs.consumer.js';
import { BullModule } from '@nestjs/bullmq';
import { GetNewJobsProvider } from './providers/get-new-jobs.provider.js';
import { GetNewJobsConsumer } from './providers/get-new-jobs.consumer.js';
import { FinishJobsProvider } from './providers/finish-jobs.provider.js';
import { AiChatModule } from '../ai_chat/ai_chat.module.js';
import { NotifyPdfsProvider } from './providers/notify-pdfs.provider.js';
import { NotifyNewPdf } from './providers/notify-pdfs.consumer.js';
import { SendsModule } from '../sends/sends.module.js';
import { JerimunScraperService } from './services/jerimun-scraper.service.js';

@Module({
  imports: [
    PrismaModule,
    UserModule,
    JobsModule,
    AiChatModule,
    PdfModule,
    SendsModule,
    BullModule.registerQueue({ name: 'sendPdf' }),
    BullModule.registerQueue({ name: 'notifyNewJobs' }),
    BullModule.registerQueue({ name: 'getNewJobs' }),
  ],
  providers: [
    PrismaService,
    FinishJobsProvider,
    ImdScraperService,
    PdfExtractorService,
    NotifyNewJobsProvider,
    NotifyNewJobsConsumer,
    NotifyPdfsProvider,
    NotifyNewPdf,
    GetNewJobsProvider,
    GetNewJobsConsumer,
    JerimunScraperService,
  ],
  controllers: [WebScrappingController],
})
export class WebScrappingModule {}
