import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { BadRequestException } from '@nestjs/common';
import { SummarizeJobVaga } from '../../ai_chat/services/summarize-job-vaga.service.js';
import { GithubJobPayload, NewJobStrategy } from './new-job.strategy.js';

export class GithubStrategy implements NewJobStrategy<GithubJobPayload> {
  constructor(
    private jobsService: JobsService,
    private readonly summarizeJobVaga: SummarizeJobVaga,
    @InjectPinoLogger(GithubStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: GithubJobPayload) {
    return job.vaga.description?.trim() || null;
  }
  async summarize(text: string) {
    return await this.summarizeJobVaga.execute(text);
  }

  async persist(job: GithubJobPayload, summary: string, keyWords: string) {
    try {
      const createdJob = await this.jobsService.createJob({
        title: job.title,
        type: job.type,
        link: job.link,
        isActive: job.isActive,
        vaga: { description: job.vaga.description || '' },
        keyWords,
        summary,
      });

      return { jobId: createdJob.id };
    } catch (e: unknown) {
      throw new BadRequestException(e);
    }
  }
}
