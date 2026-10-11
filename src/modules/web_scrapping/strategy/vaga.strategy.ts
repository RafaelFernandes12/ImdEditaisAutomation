import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { BadRequestException } from '@nestjs/common';
import {
  JobSummary,
  NewJobStrategy,
  VagaJobPayload,
} from './new-job.strategy.js';

export class VagaStrategy implements NewJobStrategy<VagaJobPayload> {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(VagaStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: VagaJobPayload) {
    return job.description?.trim() || null;
  }

  async persist(job: VagaJobPayload, resumo: JobSummary) {
    try {
      const createdJob = await this.jobsService.createJob({
        title: job.title,
        type: job.type,
        link: job.link,
        isActive: job.isActive,
        description: job.description || '',
        summary: resumo.summary,
        keyWords: resumo.keyWords.join(', '),
        attributes: resumo.attributes,
      });

      return { jobId: createdJob.id };
    } catch (e: unknown) {
      throw new BadRequestException(e);
    }
  }
}
