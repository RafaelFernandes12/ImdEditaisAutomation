import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { SummarizeJobEditalImd } from './services/summarize-job-edital-imd.service.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { SummarizeJobVaga } from './services/summarize-job-vaga.service.js';

@Module({
  imports: [PrismaModule, JobsModule],
  providers: [PrismaService, SummarizeJobEditalImd, SummarizeJobVaga],
  exports: [SummarizeJobEditalImd, SummarizeJobVaga],
})
export class AiChatModule {}
