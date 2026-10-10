import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { NotifyNewJobsProvider } from './notify-new-jobs.provider.js';
import { NotifyPdfsProvider } from './notify-pdfs.provider.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

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
    const ignoredFailures = Object.keys(await job.getIgnoredChildrenFailures());
    const log = new ScopedLogger(this.logger, 'queue.notify_all', {
      queue: 'notifyAll',
      queueJobId: job.id,
    });

    const timer = log.start(
      'job_start',
      'Coleta de editais concluída — disparando notificações',
      { ignoredFailures: ignoredFailures.length },
    );

    await this.notifyNewJobsProvider.execute();
    await this.notifyPdfsProvider.execute();

    timer.info('job_done', 'Notificações disparadas');
  }
}
