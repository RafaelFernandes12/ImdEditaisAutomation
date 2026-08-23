import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { PdfRepository } from './repositories/pdf.repository.js';
import { PdfService } from './services/pdf.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, PdfRepository, PdfService],
  // PdfRepository is exported alongside PdfService so UserEditaisLinkingService
  // can run findByEditalId inside its cross-table transaction.
  exports: [PdfService, PdfRepository],
})
export class PdfModule {}
