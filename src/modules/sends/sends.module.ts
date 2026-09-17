import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { SendsRepository } from './repositories/sends.repository.js';
import { SendsService } from './services/sends.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, SendsRepository, SendsService],
  exports: [SendsService, SendsRepository],
})
export class SendsModule {}
