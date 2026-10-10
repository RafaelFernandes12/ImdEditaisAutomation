import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class NotifyNewJobsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('notifyNewJobs') private queue: Queue,
    @InjectPinoLogger(NotifyNewJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.notify_new_jobs', {
      cron: true,
    });

    const timer = log.start(
      'start',
      'Enfileirando notificação de novos editais',
    );

    try {
      const users = await this.userService.findManyUsers();

      await this.queue.addBulk(
        users.map((user) => ({ name: 'notifyNewJobs', data: user })),
      );

      timer.info('done', 'Notificação de novos editais enfileirada', {
        enqueued: users.length,
      });
    } catch (err: unknown) {
      timer.error(
        'failed',
        'Falha ao enfileirar notificação de novos editais',
        { err },
      );
      throw err;
    }
  }
}
