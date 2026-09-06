import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { SummarizeEdital } from './services/summarize-edital.service.js';
import { EditalModule } from '../edital/edital.module.js';

@Module({
  imports: [PrismaModule, EditalModule],
  providers: [PrismaService, SummarizeEdital],
  exports: [SummarizeEdital],
})
export class AiChatModule {}
