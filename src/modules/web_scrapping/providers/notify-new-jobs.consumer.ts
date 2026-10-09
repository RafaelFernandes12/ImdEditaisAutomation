import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { client } from '#src/config/whatsapp/client.js';
import { BadRequestException } from '@nestjs/common';
import { formatJobSections } from '#src/utils/format-job-lines.js';
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

      const sections = formatJobSections(newJobs);

      const sendTimer = log.timed();

      for (const { header, body } of sections) {
        await client.sendMessage(user.chatId, `${header}:\n\n${body}`, {
          linkPreview: false,
        });
      }

      sendTimer.info('message_sent', 'Mensagem de novas vagas enviada', {
        newJobsCount: newJobs.length,
        countByType: Object.fromEntries(
          sections.map(({ type, count }) => [type, count]),
        ),
        lengthByType: Object.fromEntries(
          sections.map(({ type, body }) => [type, body.length]),
        ),
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
