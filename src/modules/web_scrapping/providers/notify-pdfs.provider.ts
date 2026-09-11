import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class NotifyPdfsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('sendPdf') private queue: Queue,
    @InjectPinoLogger(NotifyPdfsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron('15 8,17 * * 1-5', { timeZone: 'America/Sao_Paulo' })
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.notify_pdfs.start', cron: true },
      'Enfileirando envio de PDFs',
    );

    try {
      const users = await this.userService.findManyUsers();

      await this.queue.addBulk(
        users.map((user) => ({ name: 'pdf', data: user })),
      );

      this.logger.info(
        {
          evt: 'cron.notify_pdfs.done',
          cron: true,
          enqueued: users.length,
          durationMs: Date.now() - startedAt,
        },
        'Envio de PDFs enfileirado',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.notify_pdfs.failed',
          cron: true,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao enfileirar envio de PDFs',
      );
      throw error;
    }
  }
}
