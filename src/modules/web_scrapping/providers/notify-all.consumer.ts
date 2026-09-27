import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotifyNewJobsProvider } from './notify-new-jobs.provider.js';
import { NotifyPdfsProvider } from './notify-pdfs.provider.js';

@Processor('notifyAll')
export class NotifyAllConsumer extends WorkerHost {
  constructor(
    private readonly notifyNewJobsProvider: NotifyNewJobsProvider,
    private readonly notifyPdfsProvider: NotifyPdfsProvider,
    @InjectPinoLogger(NotifyAllConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job) {
    const startedAt = Date.now();
    const ignoredFailures = Object.keys(await job.getIgnoredChildrenFailures());

    this.logger.info(
      {
        evt: 'queue.notify_all.job_start',
        queue: 'notifyAll',
        queueJobId: job.id,
        ignoredFailures: ignoredFailures.length,
      },
      'Coleta de editais concluída — disparando notificações',
    );

    await this.notifyNewJobsProvider.execute();
    await this.notifyPdfsProvider.execute();

    this.logger.info(
      {
        evt: 'queue.notify_all.job_done',
        queue: 'notifyAll',
        queueJobId: job.id,
        durationMs: Date.now() - startedAt,
      },
      'Notificações disparadas',
    );
  }
}
