import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Logger } from 'nestjs-pino';
import { StatusEdital } from '../../../../generated/prisma/client.js';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';

@Injectable()
export class UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  async updateEditaisUser(data: UpdateEditaisUser) {
    const created = await this.prisma.user.update({
      where: { contact: data.contact },
      data: {
        editais: {
          create: data.editaisId.map((editalId) => ({
            editalId,
            status: StatusEdital.SENDED,
          })),
        },
      },
    });
    return created;
  }
  async createUser(data: CreateUser) {
    const created = await this.prisma.user.create({
      data: {
        chatId: data.chatId,
        contact: data.contact,
        editais: {
          create: data.editaisId.map((editalId) => ({
            editalId,
            status: StatusEdital.SENDED,
          })),
        },
      },
    });
    return created;
  }

  async getUsers() {
    return await this.prisma.user.findMany({
      include: {
        editais: {
          include: { edital: { include: { pdfs: true } } },
        },
      },
    });
  }
}
