import { Processor, WorkerHost } from '@nestjs/bullmq';
import { FinishJobsProvider } from './finish-jobs.provider.js';

// Filho do flow criado pelo GetNewJobsProvider: desativa os editais encerrados
// antes de o NotifyAllConsumer disparar as notificações.
@Processor('finishJobs')
export class FinishJobsConsumer extends WorkerHost {
  constructor(private readonly finishJobsProvider: FinishJobsProvider) {
    super();
  }

  async process() {
    await this.finishJobsProvider.execute();
  }
}
