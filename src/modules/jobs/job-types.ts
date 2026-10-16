import { JobKind, JobType } from '#generated/prisma/enums.js';

export type { JobKind };

// Fonte única do que cada tipo de vaga é: o kind escolhe a strategy de
// gravação e o formato da mensagem, e a ordem das chaves é a ordem das seções
// nas mensagens do WhatsApp. O source é o nome da fonte mostrado em cada vaga.
// Tipo novo entra aqui e no enum do Prisma.
export const JOB_TYPES = {
  IMD: { kind: 'EDITAL', header: 'BOLSAS IMD', source: 'IMD' },
  JERIMUM: { kind: 'VAGA', header: 'VAGAS JERIMUM', source: 'Jerimum' },
  STI: { kind: 'EDITAL', header: 'EDITAIS STI', source: 'STI' },
  BACKEND_GITHUB: {
    kind: 'VAGA',
    header: 'VAGAS BACKEND GITHUB',
    source: 'GitHub Backend',
  },
  FRONTEND_GITHUB: {
    kind: 'VAGA',
    header: 'VAGAS FRONTEND GITHUB',
    source: 'GitHub Frontend',
  },

  LAIS: {
    kind: 'EDITAL',
    header: 'EDITAIS LAIS',
    source: 'Lais',
  },
} as const satisfies Record<
  JobType,
  { kind: JobKind; header: string; source: string }
>;

export const ALL_JOB_TYPES = Object.keys(JOB_TYPES) as JobType[];

export type JobTypeOfKind<K extends JobKind> = {
  [T in JobType]: (typeof JOB_TYPES)[T]['kind'] extends K ? T : never;
}[JobType];

export type EditalJobType = JobTypeOfKind<'EDITAL'>;
export type VagaJobType = JobTypeOfKind<'VAGA'>;

export function jobTypesOfKind<K extends JobKind>(kind: K) {
  return ALL_JOB_TYPES.filter(
    (type): type is JobTypeOfKind<K> => JOB_TYPES[type].kind === kind,
  );
}
