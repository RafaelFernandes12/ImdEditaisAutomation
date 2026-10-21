import { JobType } from '#generated/prisma/enums.js';
import { ALL_JOB_TYPES } from '../../jobs/job-types.js';
import type { ActiveJob } from '../../jobs/services/jobs.service.js';
import { NewJobPayload } from '../strategy/new-job.strategy.js';

export const JOB_SOURCES = Symbol('JOB_SOURCES');
export const JOB_WEIGHTS = Symbol('JOB_WEIGHTS');

export interface ListedJob {
  link: string;
  type: JobType;
}

export interface JobToFinish {
  id: number;
  validUntil?: number;
}

export type SourceWeight = [
  JobType,
  {
    ecossytem: number;
    escolaridade: number;
    salary: number;
    formato: number;
    city: number;
    modelo: number;
    senioridade: number;
    priority: number;
  },
][];

export type JobWeights = Map<JobType, SourceWeight[number][1]>;

export interface JobSource<T extends ListedJob = ListedJob> {
  readonly name: string;
  readonly types: JobType[];
  readonly weight: SourceWeight;

  list(): Promise<T[]>;
  fetchDetails(jobs: T[]): Promise<NewJobPayload[]>;
  findFinished?(active: ActiveJob[]): Promise<JobToFinish[]>;
}

export function assertCoversAllJobTypes(sources: JobSource[]) {
  const owners = new Map<JobType, string[]>();
  for (const source of sources) {
    for (const type of source.types) {
      owners.set(type, [...(owners.get(type) ?? []), source.name]);
    }
  }

  const problems = ALL_JOB_TYPES.flatMap((type) => {
    const names = owners.get(type) ?? [];
    if (names.length === 0) return [`${type} sem fonte`];
    if (names.length > 1) {
      return [`${type} em várias fontes (${names.join(', ')})`];
    }
    return [];
  });

  if (problems.length > 0) {
    throw new Error(`Registro de fontes inválido: ${problems.join('; ')}`);
  }

  return sources;
}
