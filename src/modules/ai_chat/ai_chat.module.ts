import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { SummarizeJob } from './services/summarize-job.service.js';
import { JobsModule } from '../jobs/jobs.module.js';

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [PrismaService, SummarizeJob],
  exports: [SummarizeJob],
})
export class AiChatModule {}
