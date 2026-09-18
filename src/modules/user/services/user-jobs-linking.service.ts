import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserRepository } from '../repositories/user.repository.js';
import { PdfRepository } from '../../pdf/repositories/pdf.repository.js';
import { SendsRepository } from '../../sends/repositories/sends.repository.js';
import { CreateSend } from '../../sends/dto/sends.dto.js';
import { CreateUser, UpdateJobsUser } from '../dto/user.dto.js';
import { maskContact } from '../../../utils/log-redact.js';

@Injectable()
export class UserJobsLinkingService {
  constructor(
    private readonly prisma: PrismaService,
    private userRepository: UserRepository,
    private pdfRepository: PdfRepository,
    private sendsRepository: SendsRepository,
    @InjectPinoLogger(UserJobsLinkingService.name)
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

      const linked = await this.linkJobs(tx, user.id, data.jobsId);

      this.logger.info(
        {
          evt: 'user.link_jobs.created',
          userId: user.id,
          jobsCount: data.jobsId.length,
          sendsCreated: linked.sendsCreated,
          durationMs: Date.now() - startedAt,
        },
        'Usuário criado e vinculado aos editais',
      );

      return user;
    });
  }

  async updateJobsUser(data: UpdateJobsUser) {
    const startedAt = Date.now();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.findByContact(data.contact, tx);
      if (!user) {
        this.logger.warn(
          {
            evt: 'user.link_jobs.user_not_found',
            contact: maskContact(data.contact),
            jobsCount: data.jobsId.length,
          },
          'Usuário não encontrado ao vincular editais',
        );
        throw new Error(`User with contact ${data.contact} not found`);
      }

      const linked = await this.linkJobs(tx, user.id, data.jobsId);

      this.logger.info(
        {
          evt: 'user.link_jobs.updated',
          userId: user.id,
          jobsCount: data.jobsId.length,
          sendsCreated: linked.sendsCreated,
          durationMs: Date.now() - startedAt,
        },
        'Editais vinculados ao usuário',
      );

      return user;
    });
  }

  private async linkJobs(
    tx: Prisma.TransactionClient,
    userId: number,
    jobsId: number[],
  ) {
    let sendsCreated = 0;
    let jobsWithoutPdfs = 0;

    for (const jobId of jobsId) {
      const pdfs = await this.pdfRepository.findByJobId(jobId, tx);

      let data: CreateSend[];

      if (pdfs.length > 0) {
        data = pdfs.map((pdf) => ({ userId, jobId, pdfId: pdf.id }));
      } else {
        // Vagas sem PDF (JERIMUM) geram um registro em nível de vaga.
        jobsWithoutPdfs += 1;
        const alreadySent = await this.sendsRepository.findJobLevel(
          userId,
          jobId,
          tx,
        );
        data = alreadySent ? [] : [{ userId, jobId, pdfId: null }];
      }

      const created = await this.sendsRepository.createMany(data, tx);

      sendsCreated += created.count;

      this.logger.debug(
        {
          evt: 'user.link_jobs.job',
          userId,
          jobId,
          pdfCount: pdfs.length,
          sendsCreated: created.count,
        },
        'Vaga vinculada ao usuário',
      );
    }

    if (jobsWithoutPdfs > 0) {
      this.logger.debug(
        {
          evt: 'user.link_jobs.jobs_without_pdfs',
          userId,
          jobsWithoutPdfs,
          jobsCount: jobsId.length,
        },
        'Vagas sem PDF registradas em nível de vaga',
      );
    }

    return { sendsCreated, jobsWithoutPdfs };
  }
}
