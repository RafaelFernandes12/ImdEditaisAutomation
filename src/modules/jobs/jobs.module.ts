import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { JobsRepository } from './repositories/jobs.repository.js';
import { JobsService } from './services/jobs.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, JobsRepository, JobsService],
  exports: [JobsService],
})
export class JobsModule {}
