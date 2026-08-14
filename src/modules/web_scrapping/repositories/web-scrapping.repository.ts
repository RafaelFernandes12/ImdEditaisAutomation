import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { CreateEdital, CreatePdf } from '../dto/edital.dto.js';
import { Logger } from 'nestjs-pino';

@Injectable()
export class WebScrappingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createEdital(data: CreateEdital) {
    const edital = await this.prisma.edital.upsert({
      where: { badge: data.badge },
      create: {
        title: data.title,
        badge: data.badge,
        link: data.link,
        isActive: data.isActive,
        subscriptionUntil: data.subscriptionUntil,
      },
      update: {
        title: data.title,
        link: data.link,
        isActive: data.isActive,
        subscriptionUntil: data.subscriptionUntil,
      },
    });
    this.logger.log('Insert edital', edital);

    return edital;
  }

  async createPdf(data: CreatePdf[]) {
    const pdf = await this.prisma.pdf.createMany({ data });
    this.logger.log('Insert pdf', pdf);
    return pdf;
  }

  async getPdfByLink(link: string) {
    const pdf = await this.prisma.pdf.findUnique({
      where: { link },
    });
    this.logger.log('GetPdfByLink', pdf?.id);
    return pdf;
  }

  async updateIsActiveEdital(id: number[]) {
    const editais = await this.prisma.edital.updateMany({
      where: { id: { in: id } },
      data: { isActive: false },
    });
    this.logger.log('GetEditais', editais);
    return editais;
  }
  async getEditais() {
    const editais = await this.prisma.edital.findMany();
    this.logger.log('GetEditais', editais);
    return editais;
  }
}
