import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreateSend } from '../dto/sends.dto.js';

@Injectable()
export class SendsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async createMany(
    data: CreateSend[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const sends = await tx.sends.createMany({ data });
    this.logger.log('Insert sends', sends.count);
    return sends;
  }

  async findByUserId(
    userId: number,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.sends.findMany({ where: { userId } });
  }
}
