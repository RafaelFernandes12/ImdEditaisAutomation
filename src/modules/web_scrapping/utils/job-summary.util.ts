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
import { Cotacoes, moedaDe, toBrl } from './cambio.util.js';

// O Intl separa o símbolo ("R$", "US$") do valor com espaço não separável.
function formatMoeda(value: number, moeda: string) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: moeda,
    })
      .format(value)
      .replace(/\u00a0/g, ' ');
  } catch {
    // Código que o Intl não conhece.
    return `${moeda} ${value}`;
  }
}

export function formatBrl(value: number) {
  return formatMoeda(value, 'BRL');
}

// Moeda estrangeira mostra o valor original e, se houver cotação, em reais.
function formatRemuneracao(vaga: VagaResumida, cotacoes: Cotacoes) {
  if (vaga.remuneração === null) return null;

  const moeda = moedaDe(vaga.moeda);
  if (moeda === 'BRL') return formatBrl(vaga.remuneração);

  const original = formatMoeda(vaga.remuneração, moeda);
  const emReais = toBrl(vaga.remuneração, moeda, cotacoes);
  return emReais === null ? original : `${original} ≈ ${formatBrl(emReais)}`;
}

export function vagaKeywords({ keywords }: { keywords: string[] }) {
  return [
    ...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)),
  ];
}

// Uma vaga por perfil que a IA achou no texto (edital pode ter vários).
// Perfil fora de tecnologia é descartado; o job é gravado mesmo sem vagas
// para não ser resumido de novo a cada execução.
export function toVagas(
  { vagas }: ResumoVagas,
  cotacoes: Cotacoes = {},
): CreateVaga[] {
  return vagas
    .filter((vaga) => vaga.isTech && vaga.vaga !== null)
    .map((vaga) => ({
      summary: formatVaga(vaga, cotacoes),
      keyWords: vagaKeywords(vaga).join(', '),
      ...vagaAttributes(vaga, cotacoes),
    }));
}

// Texto do resumo enviado no WhatsApp. Campo que a IA não achou (null) fica
// de fora em vez de aparecer como "não informado".
export function formatVaga(vaga: VagaResumida, cotacoes: Cotacoes = {}) {
  const valor = formatRemuneracao(vaga, cotacoes);

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

  // Local vai na linha do cargo e a escolaridade na da senioridade, para o
  // resumo ficar curto.
  const localizacao = [vaga.cidade, vaga.estado].filter(Boolean).join('/');
  const nivel = [
    vaga.senioridade && SENIORIDADE_LABELS[vaga.senioridade],
    vaga.escolaridade && ESCOLARIDADE_LABELS[vaga.escolaridade],
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    `*Vaga:* ${vaga.vaga}` + (localizacao ? ` | ${localizacao}` : ''),
    nivel && `*Senioridade:* ${nivel}`,
    remuneracao,
    vaga.keywords.length > 0 &&
      `*Palavras-chaves:* ${vaga.keywords.join(', ')}`,
    vaga.elegibilidade && `*Elegibilidade:* ${vaga.elegibilidade}`,
  ]
    .filter(Boolean)
    .join('\n');
}
