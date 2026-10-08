import type { EditalJobType, VagaJobType } from '../job-types.js';

export class CreateJobBase {
  title: string;
  link: string;
  isActive: boolean;
  summary: string;
  keyWords: string;
}

export class CreateEditalJob extends CreateJobBase {
  type: EditalJobType;
  edital: {
    subscriptionUntil: Date;
    validUntil?: Date | null;
  };
}

export class CreateVagaJob extends CreateJobBase {
  type: VagaJobType;
  vaga: {
    description: string;
  };
}

export type CreateJob = CreateEditalJob | CreateVagaJob;
