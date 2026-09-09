import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreateEdital } from '../dto/edital.dto.js';

@Injectable()
export class EditalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createEdital(
    data: CreateEdital,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const edital = await tx.edital.upsert({
      where: { badge: data.badge },
      create: {
        title: data.title,
        badge: data.badge,
        link: data.link,
        isActive: data.isActive,
        subscriptionUntil: data.subscriptionUntil,
        summary: data.summary,
        keyWords: data.keyWords,
      },
      update: { badge: data.badge },
    });

    return edital;
  }

  async findActive(tx: Prisma.TransactionClient = this.prisma) {
    const editais = await tx.edital.findMany({
      where: { isActive: true },
      include: { pdfs: true, sends: true },
      orderBy: { subscriptionUntil: 'desc' },
    });
    return editais;
  }

  async deactivateMany(
    data: {
      id: number;
      validUntil: number;
    }[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const editais = await Promise.all(
      data.map(
        async (d) =>
          await tx.edital.update({
            where: { id: d.id },
            data: {
              isActive: false,
              finishedAt: new Date(),
              validUntil: new Date(
                new Date().setMonth(new Date().getMonth() + d.validUntil),
              ),
            },
          }),
      ),
    );
    return editais;
  }
}
