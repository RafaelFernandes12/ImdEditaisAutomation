import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class NotifyNewEditaisProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('notifyNewEditais') private queue: Queue,
  ) {}

  @Cron('* * 11 * *')
  async execute() {
    const users = await this.userService.findManyUsers();

    await this.queue.addBulk(
      users.map((user) => ({ name: 'notifyNewEditais', data: user })),
    );
  }
}
