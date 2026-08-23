import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma/client.js';
import {
  CreateEditalToUser,
  UpdateEditalToUserStatus,
} from '../dto/edital-to-user.dto.js';

@Injectable()
export class EditalToUserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async updateStatus(
    { id, status }: UpdateEditalToUserStatus,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const editalToUser = await tx.editalToUser.update({
      where: { id },
      data: { status },
    });
    this.logger.log('Insert editalToUser', editalToUser);
    return editalToUser;
  }
  async create(
    data: CreateEditalToUser,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const editalToUser = await tx.editalToUser.create({ data });
    this.logger.log('Insert editalToUser', editalToUser);
    return editalToUser;
  }
}
