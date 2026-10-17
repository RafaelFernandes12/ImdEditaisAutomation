import {
  EditalJobType,
  JobKind,
  VagaJobType,
} from '#src/modules/jobs/job-types.js';
import type { CreateVaga } from '#src/modules/jobs/dto/jobs.dto.js';

interface NewJobPayloadBase {
  title: string;
  link: string;
  isActive: boolean;
  // Quando a fonte informa a publicação (GitHub: criação da issue), em ISO,
  // porque o payload passa pela fila como JSON.
  publishedAt?: string;
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
  description: string | null;
}
export type NewJobPayload = EditalJobPayload | VagaJobPayload;

export interface PersistedJob {
  jobId: number;
  logContext?: Record<string, unknown>;
}

export interface NewJobStrategy<T extends NewJobPayload> {
  getText(job: T): string | null;
  persist(
    job: T,
    vagas: CreateVaga[],
    publishedAt: Date,
  ): Promise<PersistedJob>;
}

interface NewJobPayloadByKind {
  EDITAL: EditalJobPayload;
  VAGA: VagaJobPayload;
}

// Uma strategy por kind: tipo novo de um kind existente não exige strategy nova.
export type NewJobStrategies = {
  [K in JobKind]: NewJobStrategy<NewJobPayloadByKind[K]>;
};
