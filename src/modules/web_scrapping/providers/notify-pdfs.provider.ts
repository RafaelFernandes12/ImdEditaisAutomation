import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotifyPdfsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('sendPdf') private queue: Queue,
  ) {}

  @Cron('* 12 * * *')
  async execute() {
    const users = await this.userService.findManyUsers();

    await this.queue.addBulk(
      users.map((user) => ({ name: 'pdf', data: user })),
    );
  }
}
