import { JobType } from '../../../../generated/prisma/client.js';

export type EditalJobType = Exclude<JobType, 'JERIMUM'>;

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

export class CreateJerimumJob extends CreateJobBase {
  type: Extract<JobType, 'JERIMUM'>;
  jerimum: {
    description: string;
    contractType: string;
  };
}

export type CreateJob = CreateEditalJob | CreateJerimumJob;
