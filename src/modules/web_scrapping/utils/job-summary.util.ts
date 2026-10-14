import type {
  ResumoVagas,
  VagaResumida,
} from '../../ai_chat/services/summarize-job.service.js';
import type { CreateVaga } from '#src/modules/jobs/dto/jobs.dto.js';
import {
  ESCOLARIDADE_LABELS,
  FORMATO_LABELS,
  MODELO_LABELS,
  SENIORIDADE_LABELS,
} from '#src/modules/user/models/preferences.js';
import { vagaAttributes } from './job-attributes.util.js';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

// O Intl separa "R$" do valor com espaço não separável.
export function formatBrl(value: number) {
  return brl.format(value).replace(/\u00a0/g, ' ');
}

export function vagaKeywords({ keywords }: { keywords: string[] }) {
  return [
    ...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ];
}

// Uma vaga por perfil que a IA achou no texto (edital pode ter vários).
export function toVagas({ vagas }: ResumoVagas): CreateVaga[] {
  return vagas.map((vaga) => ({
    summary: formatVaga(vaga),
    keyWords: vagaKeywords(vaga).join(', '),
    ...vagaAttributes(vaga),
  }));
}

// Texto do resumo enviado no WhatsApp. Campo que a IA não achou (null) fica
// de fora em vez de aparecer como "não informado".
export function formatVaga(vaga: VagaResumida) {
  const qtdVagas = [
    vaga.qtdVagas !== null && `${vaga.qtdVagas}`,
    vaga.cadastroReserva !== null && `${vaga.cadastroReserva} CR`,
  ]
    .filter(Boolean)
    .join(' + ');

  const valor = vaga.remuneração === null ? null : formatBrl(vaga.remuneração);

  const condicoes = [
    vaga.horasSemanais !== null && `${vaga.horasSemanais}h semanais`,
    vaga.turno,
    vaga.formato && FORMATO_LABELS[vaga.formato],
    vaga.modalidade && MODELO_LABELS[vaga.modalidade],
  ].filter(Boolean);

  const remuneracao =
    valor || condicoes.length > 0
      ? `*Remuneração:* ${valor ?? 'não informada'}` +
        (condicoes.length > 0 ? ` (${condicoes.join(' / ')})` : '')
      : null;

  const localizacao = [vaga.cidade, vaga.estado].filter(Boolean).join(' / ');

  return [
    `*Vaga:* ${vaga.vaga}`,
    vaga.senioridade &&
      `*Senioridade:* ${SENIORIDADE_LABELS[vaga.senioridade]}`,
    vaga.escolaridade &&
      `*Escolaridade:* ${ESCOLARIDADE_LABELS[vaga.escolaridade]}`,
    qtdVagas && `*Qtd vagas:* ${qtdVagas}`,
    remuneracao,
    localizacao && `*Localização:* ${localizacao}`,
    vaga.keywords.length > 0 &&
      `*Palavras-chaves:* ${vaga.keywords.join(', ')}`,
    vaga.duracao && `*Duração:* ${vaga.duracao}`,
    vaga.elegibilidade && `*Elegibilidade:* ${vaga.elegibilidade}`,
  ]
    .filter(Boolean)
    .join('\n');
}
