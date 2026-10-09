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
import { ScopedLogger } from '../../../utils/scoped-logger.js';

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

  private logWith(bindings: Record<string, unknown>) {
    return new ScopedLogger(this.logger, 'user.link_jobs', bindings);
  }

  async createUser(data: CreateUser) {
    const log = this.logWith({ jobsCount: data.jobsId.length }).timed();

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

      log.info('created', 'Usuário criado e vinculado aos editais', {
        userId: user.id,
        sendsCreated: linked.sendsCreated,
      });

      return user;
    });
  }

  async updateJobsUser(data: UpdateJobsUser) {
    const log = this.logWith({ jobsCount: data.jobsId.length });
    const timer = log.timed();

    return this.prisma.$transaction(async (tx) => {
      const user = await this.userRepository.findByContact(data.contact, tx);
      if (!user) {
        log.warn(
          'user_not_found',
          'Usuário não encontrado ao vincular editais',
          {
            contact: maskContact(data.contact),
          },
        );
        throw new Error(`User with contact ${data.contact} not found`);
      }

      const linked = await this.linkJobs(tx, user.id, data.jobsId);

      timer.info('updated', 'Editais vinculados ao usuário', {
        userId: user.id,
        sendsCreated: linked.sendsCreated,
      });

      return user;
    });
  }

  private async linkJobs(
    tx: Prisma.TransactionClient,
    userId: number,
    jobsId: number[],
  ) {
    const log = this.logWith({ userId });
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

      log.debug('job', 'Vaga vinculada ao usuário', {
        jobId,
        pdfCount: pdfs.length,
        sendsCreated: created.count,
      });
    }

    if (jobsWithoutPdfs > 0) {
      log.debug(
        'jobs_without_pdfs',
        'Vagas sem PDF registradas em nível de vaga',
        {
          jobsWithoutPdfs,
          jobsCount: jobsId.length,
        },
      );
    }

    return { sendsCreated, jobsWithoutPdfs };
  }
}
