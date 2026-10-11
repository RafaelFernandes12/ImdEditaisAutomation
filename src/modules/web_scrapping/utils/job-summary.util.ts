import type {
  ResumoVagas,
  VagaResumida,
} from '../../ai_chat/services/summarize-job.service.js';
import type { JobSummary } from '../strategy/new-job.strategy.js';
import { jobAttributes } from './job-attributes.util.js';

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

// O Intl separa "R$" do valor com espaço não separável.
export function formatBrl(value: number) {
  return brl.format(value).replace(/\u00a0/g, ' ');
}

// Texto do resumo enviado no WhatsApp. Campo que a IA não achou (null) fica
// de fora em vez de aparecer como "não informado".
export function formatJobSummary({ vagas }: ResumoVagas) {
  return vagas.map(formatVaga).join('\n\n');
}

// Serve para vaga e edital: os dois resumos têm keywords por vaga.
export function vagaKeywords({ vagas }: { vagas: { keywords: string[] }[] }) {
  return [
    ...new Set(
      vagas.flatMap((vaga) =>
        vaga.keywords.map((keyword) => keyword.trim()).filter(Boolean),
      ),
    ),
  ];
}

export function toJobSummary(resumo: ResumoVagas): JobSummary {
  return {
    summary: formatJobSummary(resumo),
    keyWords: vagaKeywords(resumo),
    attributes: jobAttributes(resumo),
  };
}

function formatVaga(vaga: VagaResumida) {
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
    vaga.modalidade,
  ].filter(Boolean);

  const remuneracao =
    valor || condicoes.length > 0
      ? `*Remuneração:* ${valor ?? 'não informada'}` +
        (condicoes.length > 0 ? ` (${condicoes.join(' / ')})` : '')
      : null;

  const localizacao = [vaga.cidade, vaga.estado].filter(Boolean).join(' / ');

  return [
    `*Vaga:* ${vaga.vaga}`,
    vaga.senioridade && `*Senioridade:* ${vaga.senioridade}`,
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
