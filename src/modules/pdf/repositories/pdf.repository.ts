import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { PdfTipo, Prisma } from '../../../../generated/prisma/client.js';
import { CreatePdf } from '../dto/pdf.dto.js';

const withJob = {
  edital: { include: { job: true } },
} satisfies Prisma.PdfInclude;

export type PdfWithJob = Prisma.PdfGetPayload<{ include: typeof withJob }>;

const withJobAndEditalPdf = {
  edital: { include: { job: true, pdfs: { where: { type: 'EDITAL' } } } },
} satisfies Prisma.PdfInclude;

export type PdfWithJobAndEditalPdf = Prisma.PdfGetPayload<{
  include: typeof withJobAndEditalPdf;
}>;

@Injectable()
export class PdfRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(
    data: CreatePdf[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdf = await tx.pdf.createMany({ data });
    return pdf;
  }

  async findAllByUserName(
    userName: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdf = await tx.pdf.findMany({
      where: { text: { contains: userName, mode: 'insensitive' } },
      include: withJobAndEditalPdf,
      orderBy: { created_at: 'desc' },
    });
    return pdf;
  }
  async findAllActiveByUserName(
    userName: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const pdf = await tx.pdf.findMany({
      where: {
        edital: { job: { isActive: true } },
        text: { contains: userName, mode: 'insensitive' },
      },
      include: withJob,
    });
    return pdf;
  }

  async findByLabel(type: PdfTipo, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findMany({
      where: { type, edital: { job: { isActive: true } } },
    });
    return pdf;
  }
  async findByLink(link: string, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findUnique({ where: { link } });
    return pdf;
  }

  async findByJobId(jobId: number, tx: Prisma.TransactionClient = this.prisma) {
    const pdfs = await tx.pdf.findMany({ where: { editalId: jobId } });
    return pdfs;
  }
}
