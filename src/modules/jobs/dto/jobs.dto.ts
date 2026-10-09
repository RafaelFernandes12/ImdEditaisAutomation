import { JobType } from '../../../../generated/prisma/client.js';

export type EditalJobType = Extract<JobType, 'IMD' | 'STI'>;
export type DescriptionJobType = Exclude<JobType, EditalJobType>;

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
  type: DescriptionJobType;
  vaga: {
    description: string;
  };
}

export type CreateJob = CreateEditalJob | CreateVagaJob;
