import {
  EditalJobType,
  JobKind,
  VagaJobType,
} from '#src/modules/jobs/job-types.js';

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

export interface VagaJobPayload extends NewJobPayloadBase {
  type: VagaJobType;
  vaga: { description: string | null };
}
export type NewJobPayload = EditalJobPayload | VagaJobPayload;

export interface JobSummary {
  summary: string;
  keyWords: string[];
}

export interface PersistedJob {
  jobId: number;
  logContext?: Record<string, unknown>;
}

export interface NewJobStrategy<T extends NewJobPayload> {
  getText(job: T): string | null;
  summarize(text: string): Promise<JobSummary>;
  persist(job: T, summary: string, keyWords: string): Promise<PersistedJob>;
}

interface NewJobPayloadByKind {
  edital: EditalJobPayload;
  vaga: VagaJobPayload;
}

// Uma strategy por kind: tipo novo de um kind existente não exige strategy nova.
export type NewJobStrategies = {
  [K in JobKind]: NewJobStrategy<NewJobPayloadByKind[K]>;
};
