import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreateSend } from '../dto/sends.dto.js';

@Injectable()
export class SendsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createMany(
    data: CreateSend[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const sends = await tx.sends.createMany({ data, skipDuplicates: true });
    return sends;
  }

  /**
   * Registro de envio em nível de vaga (sem PDF) — usado por vagas JERIMUM.
   * O índice único não deduplica `pdfId IS NULL` (em Postgres NULL é distinto de
   * NULL), então a checagem de existência fica aqui.
   */
  async findJobLevel(
    userId: number,
    jobId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.sends.findFirst({ where: { userId, jobId, pdfId: null } });
  }

  async findByUserId(
    userId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.sends.findMany({ where: { userId } });
  }
}
