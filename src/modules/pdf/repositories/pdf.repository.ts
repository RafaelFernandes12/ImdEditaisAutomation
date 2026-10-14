import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { PdfTipo, Prisma } from '../../../../generated/prisma/client.js';

const withJob = {
  job: { include: { vagas: { orderBy: { id: 'asc' } } } },
} satisfies Prisma.PdfInclude;

export type PdfWithJob = Prisma.PdfGetPayload<{ include: typeof withJob }>;

const withJobAndEditalPdf = {
  job: { include: { pdfs: { where: { type: 'EDITAL' } } } },
} satisfies Prisma.PdfInclude;

export type PdfWithJobAndEditalPdf = Prisma.PdfGetPayload<{
  include: typeof withJobAndEditalPdf;
}>;

@Injectable()
export class PdfRepository {
  constructor(private readonly prisma: PrismaService) {}

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
        job: { isActive: true },
        text: { contains: userName, mode: 'insensitive' },
      },
      include: withJob,
    });
    return pdf;
  }

  async findByLabel(type: PdfTipo, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findMany({
      where: { type, job: { isActive: true } },
    });
    return pdf;
  }
  async findByLink(link: string, tx: Prisma.TransactionClient = this.prisma) {
    const pdf = await tx.pdf.findUnique({ where: { link } });
    return pdf;
  }

  async findByJobId(jobId: number, tx: Prisma.TransactionClient = this.prisma) {
    const pdfs = await tx.pdf.findMany({ where: { jobId } });
    return pdfs;
  }
}
