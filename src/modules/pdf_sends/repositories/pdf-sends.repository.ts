import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreatePdfSend } from '../dto/pdf-sends.dto.js';

@Injectable()
export class PdfSendsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createMany(
    data: CreatePdfSend[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const sends = await Promise.all(
      data.map((send) => tx.pdfSends.create({ data: send })),
    );
    this.logger.log('Insert pdfSends', sends.length);
    return sends;
  }
}
