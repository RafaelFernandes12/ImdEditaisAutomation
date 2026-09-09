import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotifyNewEditaisProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('notifyNewEditais') private queue: Queue,
    @InjectPinoLogger(NotifyNewEditaisProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.notify_new_editais.start', cron: true },
      'Enfileirando notificação de novos editais',
    );

    try {
      const users = await this.userService.findManyUsers();

      await this.queue.addBulk(
        users.map((user) => ({ name: 'notifyNewEditais', data: user })),
      );

      this.logger.info(
        {
          evt: 'cron.notify_new_editais.done',
          cron: true,
          enqueued: users.length,
          durationMs: Date.now() - startedAt,
        },
        'Notificação de novos editais enfileirada',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.notify_new_editais.failed',
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
