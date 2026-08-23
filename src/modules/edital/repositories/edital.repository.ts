import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreateEdital } from '../dto/edital.dto.js';

@Injectable()
export class EditalRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createEdital(
    data: CreateEdital,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const edital = await tx.edital.create({
      data: {
        title: data.title,
        badge: data.badge,
        link: data.link,
        isActive: data.isActive,
        subscriptionUntil: data.subscriptionUntil,
        summary: data.summary,
        keyWords: data.keyWords,
      },
    });
    this.logger.log('Insert edital', edital);

    return edital;
  }

  async findActive(tx: Prisma.TransactionClient = this.prisma) {
    const editais = await tx.edital.findMany({
      where: { isActive: true },
      include: { pdfs: true, users: true },
    });
    this.logger.log('GetEditaisActive', editais);
    return editais;
  }

  async deactivateMany(
    ids: number[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const editais = await tx.edital.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    });
    this.logger.log('DeactivateEditais', editais);
    return editais;
  }
}
