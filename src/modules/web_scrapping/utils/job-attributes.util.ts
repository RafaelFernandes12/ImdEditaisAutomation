import {
  FORMATO_LABELS,
  MODELO_LABELS,
  SENIORIDADE_LABELS,
} from '#src/modules/user/models/preferences.js';
import type { JobAttributes } from '#src/modules/jobs/dto/jobs.dto.js';
import type { VagaResumida } from '#src/modules/ai_chat/services/summarize-job.service.js';

export const NAO_INFORMADO = 'Não informado';

type VagaAttributes = Pick<
  VagaResumida,
  'formato' | 'cidade' | 'estado' | 'modalidade' | 'senioridade'
>;

function fromLabel<T extends string>(labels: Record<T, string>) {
  const byLabel = new Map(
    Object.entries(labels).map(([value, label]) => [label, value as T]),
  );
  return (label: string | null): T | undefined =>
    label ? byLabel.get(label) : undefined;
}

const toFormato = fromLabel(FORMATO_LABELS);
const toModelo = fromLabel(MODELO_LABELS);
const toSenioridade = fromLabel(SENIORIDADE_LABELS);

function first(values: (string | null)[]) {
  return values.map((value) => value?.trim()).find(Boolean);
}

function unique<T>(values: (T | undefined)[]) {
  return [...new Set(values.filter((value) => value !== undefined))];
}

export function jobAttributes({
  vagas,
}: {
  vagas: VagaAttributes[];
}): JobAttributes {
  return {
    formato:
      vagas.map((vaga) => toFormato(vaga.formato)).find(Boolean) ??
      'NAO_INFORMADO',
    city: first(vagas.map((vaga) => vaga.cidade)) ?? NAO_INFORMADO,
    state: first(vagas.map((vaga) => vaga.estado)) ?? NAO_INFORMADO,
    modelo: unique(vagas.map((vaga) => toModelo(vaga.modalidade))),
    senioridade: unique(vagas.map((vaga) => toSenioridade(vaga.senioridade))),
  };
}
