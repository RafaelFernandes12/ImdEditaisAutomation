import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma/client.js';

interface CreateUserData {
  chatId: string;
  contact: string;
  name: string;
  matricula: string;
  curriculoVitae?: string;
  curriculoLattes?: string;
  keyWords?: string;
}

@Injectable()
export class UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async create(
    data: CreateUserData,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await tx.user.create({ data });
    this.logger.log('Insert user', user);
    return user;
  }

  async findByChatId(
    chatId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.findUnique({
      where: { chatId },
      include: { editais: true },
    });
  }

  async findByContact(
    contact: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.findUnique({ where: { contact } });
  }

  async findByExtensionToken(
    extensionToken: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.findUnique({ where: { extensionToken } });
  }

  async setExtensionToken(
    chatId: string,
    extensionToken: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.update({
      where: { chatId },
      data: { extensionToken },
    });
  }

  async findMany(tx: Prisma.TransactionClient = this.prisma) {
    return await tx.user.findMany({
      include: {
        editais: {
          include: {
            pdfSends: { include: { pdf: true } },
            edital: { include: { pdfs: true } },
          },
        },
      },
    });
  }
}
