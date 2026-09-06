import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/services/user.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotifyPdfsProvider {
  constructor(
    private userService: UserService,
    @InjectQueue('sendPdf') private queue: Queue,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    const users = await this.userService.findManyUsers();

    await this.queue.addBulk(
      users.map((user) => ({ name: 'pdf', data: user })),
    );
  }
}
