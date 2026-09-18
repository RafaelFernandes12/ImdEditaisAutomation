import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { SummarizeJobEditalImd } from './services/summarize-job-edital-imd.service.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { SummarizeJobJerimum } from './services/summarize-job-jerimum.service.js';

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [PrismaService, SummarizeJobEditalImd, SummarizeJobJerimum],
  exports: [SummarizeJobEditalImd, SummarizeJobJerimum],
})
export class AiChatModule {}
