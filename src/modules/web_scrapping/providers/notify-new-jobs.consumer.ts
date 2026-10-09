import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { client } from '#src/config/whatsapp/client.js';
import { BadRequestException } from '@nestjs/common';
import {
  formatEditalLines,
  formatJobVagaLines,
} from '#src/utils/format-job-lines.js';

@Processor('notifyNewJobs')
export class NotifyNewJobsConsumer extends WorkerHost {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(NotifyNewJobsConsumer.name)
    private readonly logger: PinoLogger,
    private readonly userService: UserService,
  ) {
    super();
  }

  async process(job: Job) {
    const startedAt = Date.now();
    const user = job.data as Awaited<
      ReturnType<UserService['findManyUsers']>
    >[number];

    this.logger.debug(
      {
        evt: 'queue.notify_new_jobs.job_start',
        queue: 'notifyNewJobs',
        queueJobId: job.id,
        attempt: job.attemptsMade + 1,
        userId: user.id,
      },
      'Verificando novos editais para o usuário',
    );

    try {
      const jobsAndamento = await this.jobsService.findActive();
      const newJobs = jobsAndamento.filter(
        (e) => !user.sends.some((uSends) => uSends.jobId === e.id),
      );

      if (newJobs.length === 0) {
        this.logger.debug(
          {
            evt: 'queue.notify_new_jobs.nothing_new',
            queue: 'notifyNewJobs',
            queueJobId: job.id,
            userId: user.id,
            activeCount: jobsAndamento.length,
            durationMs: Date.now() - startedAt,
          },
          'Nenhuma vaga nova para o usuário',
        );
        return;
      }

      const imdEditais = newJobs.filter((job) => job.type === 'IMD');
      const jerimunJobs = newJobs.filter((job) => job.type === 'JERIMUM');
      const stiEditais = newJobs.filter((job) => job.type === 'STI');
      const backendGitHub = newJobs.filter(
        (job) => job.type === 'BACKEND_GITHUB',
      );
      const frontendGitHub = newJobs.filter(
        (job) => job.type === 'FRONTEND_GITHUB',
      );

      const bodyImd = formatEditalLines(imdEditais);
      const bodyJerimum = formatJobVagaLines(jerimunJobs);
      const bodySti = formatEditalLines(stiEditais);
      const bodyBack = formatJobVagaLines(backendGitHub);
      const bodyFront = formatJobVagaLines(frontendGitHub);

      const sendStartedAt = Date.now();

      if (imdEditais.length > 0) {
        await client.sendMessage(user.chatId, `BOLSAS IMD: \n\n${bodyImd}`, {
          linkPreview: false,
        });
      }

      if (jerimunJobs.length > 0) {
        await client.sendMessage(
          user.chatId,
          `VAGAS JERIMUM: \n\n${bodyJerimum}`,
          {
            linkPreview: false,
          },
        );
      }

      if (stiEditais.length > 0) {
        await client.sendMessage(user.chatId, `Editais STI:\n\n${bodySti}`, {
          linkPreview: false,
        });
      }

      if (bodyBack.length > 0) {
        await client.sendMessage(
          user.chatId,
          `VAGAS BACKEND GITHUB:\n\n${bodyBack}`,
          {
            linkPreview: false,
          },
        );
      }

      if (bodyFront.length > 0) {
        await client.sendMessage(
          user.chatId,
          `VAGAS FRONTEND GITHUB:\n\n${bodyFront}`,
          {
            linkPreview: false,
          },
        );
      }

      this.logger.info(
        {
          evt: 'queue.notify_new_jobs.message_sent',
          queue: 'notifyNewJobs',
          queueJobId: job.id,
          userId: user.id,
          newJobsCount: newJobs.length,
          imdCount: imdEditais.length,
          jerimumCount: jerimunJobs.length,
          stiCount: stiEditais.length,
          imdLength: bodyImd.length,
          jerimumLength: bodyJerimum.length,
          stiLength: bodySti.length,
          durationMs: Date.now() - sendStartedAt,
        },
        'Mensagem de novas vagas enviada',
      );

      await this.userService.updateJobsUser({
        contact: user.contact,
        jobsId: newJobs.map((e) => e.id),
      });

      this.logger.info(
        {
          evt: 'queue.notify_new_jobs.job_done',
          queue: 'notifyNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          newJobsCount: newJobs.length,
          durationMs: Date.now() - startedAt,
        },
        'Usuário notificado sobre novos editais',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.notify_new_jobs.job_failed',
          queue: 'notifyNewJobs',
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao notificar usuário sobre novos editais',
      );
      throw new BadRequestException(e);
    }
  }
}
