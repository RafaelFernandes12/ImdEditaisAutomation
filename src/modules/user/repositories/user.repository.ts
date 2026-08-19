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

  private async buildEditaisToSend(editaisId: number[]) {
    return Promise.all(
      editaisId.map(async (editalId) => {
        const pdfs = await this.prisma.pdf.findMany({
          where: { editalId },
        });
        return {
          editalId,
          status: StatusEdital.SENDED,
          pdfSends: {
            create: pdfs.map((pdf) => ({ pdfId: pdf.id })),
          },
        };
      }),
    );
  }

  async updateEditaisUser(data: UpdateEditaisUser) {
    const editaisToSend = await this.buildEditaisToSend(data.editaisId);
    const created = await this.prisma.user.update({
      where: { contact: data.contact },
      data: {
        editais: {
          create: editaisToSend,
        },
      },
    });
    return created;
  }
  async createUser(data: CreateUser) {
    const editaisToSend = await this.buildEditaisToSend(data.editaisId);
    const created = await this.prisma.user.create({
      data: {
        chatId: data.chatId,
        contact: data.contact,
        name: data.name,
        matricula: data.matricula,
        editais: {
          create: editaisToSend,
        },
      },
    });
    return created;
  }

  async findByChatId(chatId: string) {
    return await this.prisma.user.findUnique({
      where: { chatId },
      include: { editais: true },
    });
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
