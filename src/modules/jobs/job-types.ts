import { JobType } from '#generated/prisma/enums.js';

export type JobKind = 'edital' | 'vaga';

export const JOB_TYPES = {
  IMD: { kind: 'edital', header: 'BOLSAS IMD' },
  JERIMUM: { kind: 'vaga', header: 'VAGAS JERIMUM' },
  STI: { kind: 'edital', header: 'EDITAIS STI' },
  BACKEND_GITHUB: { kind: 'vaga', header: 'VAGAS BACKEND GITHUB' },
  FRONTEND_GITHUB: { kind: 'vaga', header: 'VAGAS FRONTEND GITHUB' },
} as const satisfies Record<JobType, { kind: JobKind; header: string }>;

export const ALL_JOB_TYPES = Object.keys(JOB_TYPES) as JobType[];

export type JobTypeOfKind<K extends JobKind> = {
  [T in JobType]: (typeof JOB_TYPES)[T]['kind'] extends K ? T : never;
}[JobType];

export type EditalJobType = JobTypeOfKind<'edital'>;
export type VagaJobType = JobTypeOfKind<'vaga'>;

export function jobTypesOfKind<K extends JobKind>(kind: K) {
  return ALL_JOB_TYPES.filter(
    (type): type is JobTypeOfKind<K> => JOB_TYPES[type].kind === kind,
  );
}
