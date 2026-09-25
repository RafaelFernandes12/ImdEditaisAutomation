import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { client } from '#src/config/whatsapp/client.js';
import { BadRequestException } from '@nestjs/common';
import {
  formatEditalLines,
  formatJerimumLines,
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

      const bodyImd = formatEditalLines(imdEditais);
      const bodyJerimum = formatJerimumLines(jerimunJobs);
      const bodySti = formatEditalLines(stiEditais);

      const sendStartedAt = Date.now();
      if (imdEditais.length > 0) {
        await client.sendMessage(user.chatId, bodyImd);
      }
      if (jerimunJobs.length > 0) {
        await client.sendMessage(user.chatId, bodyJerimum);
      }
      if (stiEditais.length > 0) {
        await client.sendMessage(user.chatId, `Editais STI:\n${bodySti}`);
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
