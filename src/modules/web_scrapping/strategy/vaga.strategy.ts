import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { BadRequestException } from '@nestjs/common';
import { NewJobStrategy, VagaJobPayload } from './new-job.strategy.js';
import type { CreateVaga } from '../../jobs/dto/jobs.dto.js';

export class VagaStrategy implements NewJobStrategy<VagaJobPayload> {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(VagaStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: VagaJobPayload) {
    return job.description?.trim() || null;
  }

  async persist(job: VagaJobPayload, vagas: CreateVaga[], publishedAt: Date) {
    try {
      const createdJob = await this.jobsService.createJob({
        title: job.title,
        type: job.type,
        link: job.link,
        isActive: job.isActive,
        description: job.description || '',
        publishedAt,
        subscriptionUntil: job.subscriptionUntil
          ? new Date(job.subscriptionUntil)
          : null,
        vagas,
      });

      return { jobId: createdJob.id, logContext: { vagaCount: vagas.length } };
    } catch (e: unknown) {
      throw new BadRequestException(e);
    }
  }
}
