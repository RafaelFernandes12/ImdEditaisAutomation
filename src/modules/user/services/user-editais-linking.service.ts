import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma, StatusEdital } from '../../../../generated/prisma/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { PdfRepository } from '../../pdf/repositories/pdf.repository.js';
import { EditalToUserRepository } from '../../edital_to_user/repositories/edital-to-user.repository.js';
import { PdfSendsRepository } from '../../pdf_sends/repositories/pdf-sends.repository.js';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';

@Injectable()
export class UserEditaisLinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private userRepository: UserRepository,
    private pdfRepository: PdfRepository,
    private editalToUserRepository: EditalToUserRepository,
    private pdfSendsRepository: PdfSendsRepository,
  ) {}

  async createUser(data: CreateUser) {
    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.create(
        {
          chatId: data.chatId,
          contact: data.contact,
          name: data.name,
          matricula: data.matricula,
          curriculoVitae: data.curriculoVitae,
          curriculoLattes: data.curriculoLattes,
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
      const link = await this.editalToUserRepository.create(
        { userId, editalId, status: StatusEdital.SENDED },
        tx,
      );
      const pdfs = await this.pdfRepository.findByEditalId(editalId, tx);
      await this.pdfSendsRepository.createMany(
        pdfs.map((pdf) => ({ pdfId: pdf.id, editalToUserId: link.id })),
        tx,
      );
    }
  }
}
