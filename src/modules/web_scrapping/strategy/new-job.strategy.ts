import { JobType } from '#generated/prisma/enums.js';
import { EditalJobType } from '#src/modules/jobs/dto/jobs.dto.js';

interface NewJobPayloadBase {
  title: string;
  link: string;
  isActive: boolean;
}

export interface EditalJobPayload extends NewJobPayloadBase {
  type: EditalJobType;
  subscriptionUntil: Date;
  pdfs: {
    text: string;
    label: string;
    link: string;
  }[];
}

export interface JerimumJobPayload extends NewJobPayloadBase {
  type: Extract<JobType, 'JERIMUM'>;
  text: string;
}

export interface GithubJobPayload extends NewJobPayloadBase {
  type: Extract<JobType, 'BACKEND_GITHUB' | 'FRONTEND_GITHUB'>;
  vaga: { description: string | null };
}
export type NewJobPayload =
  EditalJobPayload | JerimumJobPayload | GithubJobPayload;

export interface PersistedJob {
  jobId: number;
  logContext?: Record<string, unknown>;
}

export interface NewJobStrategy<T extends NewJobPayload> {
  getText(job: T): string | null;
  summarize(text: string): Promise<string>;
  persist(job: T, summary: string, keyWords: string): Promise<PersistedJob>;
}

export type NewJobStrategies = {
  [K in JobType]: NewJobStrategy<Extract<NewJobPayload, { type: K }>>;
};
