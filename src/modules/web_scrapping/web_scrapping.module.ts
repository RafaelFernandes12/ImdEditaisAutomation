import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { WebScrappingController } from './controllers/web_scrapping.controller.js';
import { UserModule } from '../user/user.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { ImdSource } from './sources/imd.source.js';
import { PdfExtractorService } from './utils/pdf-extractor.service.js';
import { CambioService } from './utils/cambio.service.js';
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
import { JerimunSource } from './sources/jerimun.source.js';
import { StiSource } from './sources/sti.source.js';
import { NotifyAllConsumer } from './providers/notify-all.consumer.js';
import { FinishJobsConsumer } from './providers/finish-jobs.consumer.js';
import { EditalStrategy } from './strategy/edital.strategy.js';
import { VagaStrategy } from './strategy/vaga.strategy.js';
import { GithubSource } from './sources/github.source.js';
import {
  assertCoversAllJobTypes,
  JOB_SOURCES,
  JOB_WEIGHTS,
  JobSource,
} from './sources/job.source.js';
import { LaisSource } from './sources/lais.source.js';
import { FunpecSource } from './sources/funpec.source.js';
import { EctSource } from './sources/ect.source.js';
import { EcosystemFilterService } from './utils/ecosystem-filter.service.js';

const SOURCES = [
  ImdSource,
  StiSource,
  JerimunSource,
  GithubSource,
  LaisSource,
  FunpecSource,
  EctSource,
];

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
    BullModule.registerQueue({ name: 'notifyAll' }),
    BullModule.registerQueue({ name: 'finishJobs' }),
    BullModule.registerFlowProducer({
      name: 'notifyAll',
    }),
  ],
  providers: [
    PrismaService,
    FinishJobsProvider,
    FinishJobsConsumer,
    PdfExtractorService,
    EcosystemFilterService,
    CambioService,
    NotifyNewJobsProvider,
    NotifyNewJobsConsumer,
    NotifyPdfsProvider,
    NotifyNewPdf,
    GetNewJobsProvider,
    GetNewJobsConsumer,
    EditalStrategy,
    VagaStrategy,
    NotifyAllConsumer,
    ...SOURCES,
    {
      provide: JOB_SOURCES,
      inject: SOURCES,
      useFactory: (...sources: JobSource[]) => assertCoversAllJobTypes(sources),
    },
    {
      provide: JOB_WEIGHTS,
      inject: [JOB_SOURCES],
      useFactory: (sources: JobSource[]) =>
        new Map(sources.flatMap((source) => source.weight)),
    },
  ],
  exports: [JOB_WEIGHTS],
  controllers: [WebScrappingController],
})
export class WebScrappingModule {}
