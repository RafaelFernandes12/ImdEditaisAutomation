import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { client } from '#src/config/whatsapp/client.js';
import { BadRequestException } from '@nestjs/common';
import { formatRankedVagas } from '#src/utils/format-job-lines.js';
import { ScopedLogger } from '#src/utils/scoped-logger.js';
import { rankVagas } from '../utils/job-filter.util.js';

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
      const unsentJobs = jobsAndamento.filter(
        (e) => !user.sends.some((uSends) => uSends.jobId === e.id),
      );
      // Job filtrado não é marcado como enviado: se o usuário mudar as
      // preferências, ele volta a ser avaliado.
      const ranked = rankVagas(user, unsentJobs);
      const newJobsId = [...new Set(ranked.map(({ job }) => job.id))];

      if (ranked.length === 0) {
        timer.debug('nothing_new', 'Nenhuma vaga nova para o usuário', {
          activeCount: jobsAndamento.length,
          filteredOutCount: unsentJobs.length,
        });
        return;
      }

      const body = formatRankedVagas(ranked);
      const sendTimer = log.timed();

      // Uma mensagem só, com todas as vagas das fontes juntas.
      await client.sendMessage(user.chatId, `NOVAS VAGAS:\n\n${body}`, {
        linkPreview: false,
      });

      sendTimer.info('message_sent', 'Mensagem de novas vagas enviada', {
        vagaCount: ranked.length,
        newJobsCount: newJobsId.length,
        filteredOutCount: unsentJobs.length - newJobsId.length,
        countByType: ranked.reduce<Record<string, number>>(
          (count, { job }) => ({
            ...count,
            [job.type]: (count[job.type] ?? 0) + 1,
          }),
          {},
        ),
        length: body.length,
      });

      await this.userService.updateJobsUser({
        contact: user.contact,
        jobsId: newJobsId,
      });

      timer.info('job_done', 'Usuário notificado sobre novos editais', {
        newJobsCount: newJobsId.length,
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
