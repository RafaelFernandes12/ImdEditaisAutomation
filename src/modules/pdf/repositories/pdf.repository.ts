import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { PdfTipo, Prisma } from '../../../../generated/prisma/client.js';
import { CreatePdf } from '../dto/pdf.dto.js';

@Injectable()
export class PdfRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createMany(
    data: CreatePdf[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdf = await tx.pdf.createMany({ data });
    this.logger.log('Insert pdf', pdf);
    return pdf;
  }

  async findAllByUserName(
    userName: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdf = await tx.pdf.findMany({
      where: {
        edital: { isActive: true },
        text: { contains: userName, mode: 'insensitive' },
      },
      include: { edital: true },
    });
    return pdf;
  }

  async findByLabel(type: PdfTipo, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findMany({
      where: { type, edital: { isActive: true } },
    });
    return pdf;
  }
  async findByLink(link: string, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findUnique({ where: { link } });
    this.logger.log('GetPdfByLink', pdf?.id);
    return pdf;
  }

  async findByEditalId(
    editalId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdfs = await tx.pdf.findMany({ where: { editalId } });
    this.logger.log('GetPdfsByEditalId', pdfs.length);
    return pdfs;
  }
}
