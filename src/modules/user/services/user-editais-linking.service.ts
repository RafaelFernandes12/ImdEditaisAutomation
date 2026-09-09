import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { PdfRepository } from '../../pdf/repositories/pdf.repository.js';
import { SendsRepository } from '../../sends/repositories/sends.repository.js';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';
import { maskContact } from '../../../utils/log-redact.js';

@Injectable()
export class UserEditaisLinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private userRepository: UserRepository,
    private pdfRepository: PdfRepository,
    private sendsRepository: SendsRepository,
    @InjectPinoLogger(UserEditaisLinkingService.name)
    private readonly logger: PinoLogger,
  ) {}

  async createUser(data: CreateUser) {
    const startedAt = Date.now();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.create(
        {
          chatId: data.chatId,
          contact: data.contact,
          name: data.name,
        },
        tx,
      );

      const linked = await this.linkEditais(tx, user.id, data.editaisId);

      this.logger.info(
        {
          evt: 'user.link_editais.created',
          userId: user.id,
          editaisCount: data.editaisId.length,
          sendsCreated: linked.sendsCreated,
          durationMs: Date.now() - startedAt,
        },
        'Usuário criado e vinculado aos editais',
      );

      return user;
    });
  }

  async updateEditaisUser(data: UpdateEditaisUser) {
    const startedAt = Date.now();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.findByContact(data.contact, tx);
      if (!user) {
        this.logger.warn(
          {
            evt: 'user.link_editais.user_not_found',
            contact: maskContact(data.contact),
            editaisCount: data.editaisId.length,
          },
          'Usuário não encontrado ao vincular editais',
        );
        throw new Error(`User with contact ${data.contact} not found`);
      }

      const linked = await this.linkEditais(tx, user.id, data.editaisId);

      this.logger.info(
        {
          evt: 'user.link_editais.updated',
          userId: user.id,
          editaisCount: data.editaisId.length,
          sendsCreated: linked.sendsCreated,
          durationMs: Date.now() - startedAt,
        },
        'Editais vinculados ao usuário',
      );

      return user;
    });
  }

  private async linkEditais(
    tx: Prisma.TransactionClient,
    userId: number,
    editaisId: number[],
  ) {
    let sendsCreated = 0;
    let editaisWithoutPdfs = 0;

    for (const editalId of editaisId) {
      const pdfs = await this.pdfRepository.findByEditalId(editalId, tx);

      if (pdfs.length === 0) {
        editaisWithoutPdfs += 1;
      }

      const created = await this.sendsRepository.createMany(
        pdfs.map((pdf) => ({ userId, editalId, pdfId: pdf.id })),
        tx,
      );

      sendsCreated += created.count;

      this.logger.debug(
        {
          evt: 'user.link_editais.edital',
          userId,
          editalId,
          pdfCount: pdfs.length,
          sendsCreated: created.count,
        },
        'Edital vinculado ao usuário',
      );
    }

    if (editaisWithoutPdfs > 0) {
      this.logger.warn(
        {
          evt: 'user.link_editais.editais_without_pdfs',
          userId,
          editaisWithoutPdfs,
          editaisCount: editaisId.length,
        },
        'Editais sem PDF não geraram registro de envio',
      );
    }

    return { sendsCreated, editaisWithoutPdfs };
  }
}
