import { Injectable } from '@nestjs/common';
import { ActiveJob, JobsRepository } from '../repositories/jobs.repository.js';
import { CreateJob } from '../dto/jobs.dto.js';

export type { ActiveJob };

@Injectable()
export class JobsService {
  constructor(private jobsRepository: JobsRepository) {}

  async createJob(data: CreateJob) {
    return await this.jobsRepository.createJob(data);
  }
  async findManyByLink(links: string[]) {
    return await this.jobsRepository.findManyByLink(links);
  }
  async findActive() {
    return await this.jobsRepository.findActive();
  }

  async deactivateMany(data: { id: number; validUntil: number }[]) {
    return await this.jobsRepository.deactivateMany(data);
  }
}
