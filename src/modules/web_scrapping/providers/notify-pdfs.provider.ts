import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class NotifyPdfsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('sendPdf') private queue: Queue,
    @InjectPinoLogger(NotifyPdfsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.notify_pdfs', {
      cron: true,
    });

    const timer = log.start('start', 'Enfileirando envio de PDFs');

    try {
      const users = await this.userService.findManyUsers();

      await this.queue.addBulk(
        users.map((user) => ({ name: 'pdf', data: user })),
      );

      timer.info('done', 'Envio de PDFs enfileirado', {
        enqueued: users.length,
      });
    } catch (err: unknown) {
      timer.error('failed', 'Falha ao enfileirar envio de PDFs', { err });
      throw err;
    }
  }
}
