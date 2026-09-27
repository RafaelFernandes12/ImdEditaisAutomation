import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotifyNewJobsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('notifyNewJobs') private queue: Queue,
    @InjectPinoLogger(NotifyNewJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.notify_new_jobs.start', cron: true },
      'Enfileirando notificação de novos editais',
    );

    try {
      const users = await this.userService.findManyUsers();

      await this.queue.addBulk(
        users.map((user) => ({ name: 'notifyNewJobs', data: user })),
      );

      this.logger.info(
        {
          evt: 'cron.notify_new_jobs.done',
          cron: true,
          enqueued: users.length,
          durationMs: Date.now() - startedAt,
        },
        'Notificação de novos editais enfileirada',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.notify_new_jobs.failed',
          cron: true,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao enfileirar notificação de novos editais',
      );
      throw error;
    }
  }
}
