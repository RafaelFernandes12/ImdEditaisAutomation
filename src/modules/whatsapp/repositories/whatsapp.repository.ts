import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { CreatePdfSend } from '../dto/whatsapp.dto.js';

@Injectable()
export class WhatsappRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async getEditaisActive() {
    const editais = await this.prisma.edital.findMany({
      where: { isActive: true },
      include: { pdfs: true, users: true },
    });
    this.logger.log('GetEditais', editais);
    return editais;
  }

  async getEditaisFinished() {
    const editais = await this.prisma.edital.findMany({
      where: { isActive: false },
      include: { users: true },
    });
    this.logger.log('GetEditais', editais);
    return editais;
  }
  async createPdfSends(data: CreatePdfSend) {
    const send = await this.prisma.pdfSends.create({
      data: { editalToUserId: data.editalToUserId, pdfId: data.pdfId },
    });
    return send;
  }
}
