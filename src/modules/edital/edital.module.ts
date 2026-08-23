import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { EditalRepository } from './repositories/edital.repository.js';
import { EditalService } from './services/edital.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, EditalRepository, EditalService],
  exports: [EditalService],
})
export class EditalModule {}
