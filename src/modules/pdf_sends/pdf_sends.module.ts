import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { PdfSendsRepository } from './repositories/pdf-sends.repository.js';
import { PdfSendsService } from './services/pdf-sends.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, PdfSendsRepository, PdfSendsService],
  // PdfSendsRepository is exported alongside PdfSendsService so
  // UserEditaisLinkingService can create sends inside its transaction.
  exports: [PdfSendsService, PdfSendsRepository],
})
export class PdfSendsModule {}
