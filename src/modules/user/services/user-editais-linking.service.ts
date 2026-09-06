import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { PdfRepository } from '../../pdf/repositories/pdf.repository.js';
import { SendsRepository } from '../../sends/repositories/sends.repository.js';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';

@Injectable()
export class UserEditaisLinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private userRepository: UserRepository,
    private pdfRepository: PdfRepository,
    private sendsRepository: SendsRepository,
  ) {}

  async createUser(data: CreateUser) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.create(
        {
          chatId: data.chatId,
          contact: data.contact,
          name: data.name,
        },
        tx,
      );
      await this.linkEditais(tx, user.id, data.editaisId);
      return user;
    });
  }

  async updateEditaisUser(data: UpdateEditaisUser) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.findByContact(data.contact, tx);
      if (!user) {
        throw new Error(`User with contact ${data.contact} not found`);
      }
      await this.linkEditais(tx, user.id, data.editaisId);
      return user;
    });
  }

  private async linkEditais(
    tx: Prisma.TransactionClient,
    userId: number,
    editaisId: number[],
  ) {
    for (const editalId of editaisId) {
      const pdfs = await this.pdfRepository.findByEditalId(editalId, tx);
      await this.sendsRepository.createMany(
        pdfs.map((pdf) => ({ userId, editalId, pdfId: pdf.id })),
        tx,
      );
    }
  }
}
