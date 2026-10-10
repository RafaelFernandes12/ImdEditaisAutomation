import type {
  EditalVagaResumida,
  ResumoEdital,
} from '../../ai_chat/services/summarize-job-edital-imd.service.js';
import { formatBrl } from './vaga-summary.util.js';

// Texto do resumo do edital enviado no WhatsApp. Campo que a IA não achou
// (null) fica de fora em vez de aparecer como "não informado".
export function formatEditalSummary({ vagas }: ResumoEdital) {
  return vagas.map(formatEditalVaga).join('\n\n');
}

function formatEditalVaga(vaga: EditalVagaResumida) {
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
    vaga.formato,
  ].filter(Boolean);

  const remuneracao =
    valor || condicoes.length > 0
      ? `*Remuneração:* ${valor ?? 'não informada'}` +
        (condicoes.length > 0 ? ` (${condicoes.join(' / ')})` : '')
      : null;

  return [
    `*Vaga:* ${vaga.vaga}`,
    qtdVagas && `*Qtd vagas:* ${qtdVagas}`,
    remuneracao,
    vaga.keywords.length > 0 &&
      `*Palavras-chaves:* ${vaga.keywords.join(', ')}`,
    vaga.duracao && `*Duração:* ${vaga.duracao}`,
    vaga.elegibilidade && `*Elegibilidade:* ${vaga.elegibilidade}`,
  ]
    .filter(Boolean)
    .join('\n');
}
