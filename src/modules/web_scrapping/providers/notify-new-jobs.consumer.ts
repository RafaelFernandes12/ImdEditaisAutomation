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
import { ScopedLogger } from '#src/utils/scoped-logger.js';

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
    const user = job.data as Awaited<
      ReturnType<UserService['findManyUsers']>
    >[number];
    const log = new ScopedLogger(this.logger, 'queue.notify_new_jobs', {
      queue: 'notifyNewJobs',
      queueJobId: job.id,
      attempt: job.attemptsMade + 1,
      userId: user.id,
    });

    const timer = log.start(
      'job_start',
      'Verificando novos editais para o usuário',
      undefined,
      'debug',
    );

    try {
      const jobsAndamento = await this.jobsService.findActive();
      const newJobs = jobsAndamento.filter(
        (e) => !user.sends.some((uSends) => uSends.jobId === e.id),
      );

      if (newJobs.length === 0) {
        timer.debug('nothing_new', 'Nenhuma vaga nova para o usuário', {
          activeCount: jobsAndamento.length,
        });
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

      const sendTimer = log.timed();

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

      sendTimer.info('message_sent', 'Mensagem de novas vagas enviada', {
        newJobsCount: newJobs.length,
        imdCount: imdEditais.length,
        jerimumCount: jerimunJobs.length,
        stiCount: stiEditais.length,
        imdLength: bodyImd.length,
        jerimumLength: bodyJerimum.length,
        stiLength: bodySti.length,
      });

      await this.userService.updateJobsUser({
        contact: user.contact,
        jobsId: newJobs.map((e) => e.id),
      });

      timer.info('job_done', 'Usuário notificado sobre novos editais', {
        newJobsCount: newJobs.length,
      });
    } catch (e: unknown) {
      timer.error(
        'job_failed',
        'Falha ao notificar usuário sobre novos editais',
        { err: e },
      );
      throw new BadRequestException(e);
    }
  }
}
