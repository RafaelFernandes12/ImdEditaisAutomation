import { Formato, Modelo, Senioridade } from '#generated/prisma/enums.js';

// "Não informado" só existe para vaga/edital; o usuário não escolhe isso.
export const FORMATO_PREFERENCIA_LABELS = {
  PRESENCIAL: 'Presencial',
  HIBRIDO: 'Híbrido',
  REMOTO: 'Remoto',
} satisfies Partial<Record<Formato, string>>;

export const FORMATO_LABELS: Record<Formato, string> = {
  ...FORMATO_PREFERENCIA_LABELS,
  NAO_INFORMADO: 'Não informado',
};

export const MODELO_LABELS: Record<Modelo, string> = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIO: 'Estágio',
  FREELANCE: 'Freelance',
  BOLSISTA: 'Bolsista',
};

export const SENIORIDADE_LABELS: Record<Senioridade, string> = {
  ESTAGIO: 'Estágio',
  TRAINEE: 'Trainee',
  JUNIOR: 'Júnior',
  PLENO: 'Pleno',
  SENIOR: 'Sênior',
  TECHLEAD: 'Tech Lead',
  GRADUACAO: 'Graduação',
  GRADUADO: 'Graduado',
  MESTRADO: 'Mestrado',
  DOUTORADO: 'Doutorado',
};

export function isFormatoPreferencia(
  value: string,
): value is keyof typeof FORMATO_PREFERENCIA_LABELS {
  return value in FORMATO_PREFERENCIA_LABELS;
}

export function isModelo(value: string): value is Modelo {
  return value in Modelo;
}

export function isSenioridade(value: string): value is Senioridade {
  return value in Senioridade;
}
