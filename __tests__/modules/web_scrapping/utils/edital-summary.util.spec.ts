import { formatEditalSummary } from '../../../../src/modules/web_scrapping/utils/edital-summary.util.js';
import type { EditalVagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job-edital-imd.service.js';

function vaga(overrides: Partial<EditalVagaResumida> = {}): EditalVagaResumida {
  return {
    vaga: 'Bolsista de Desenvolvimento Web',
    qtdVagas: 2,
    cadastroReserva: 4,
    remuneração: 700,
    horasSemanais: 20,
    turno: 'Tarde',
    formato: 'Presencial',
    duracao: '12 meses',
    elegibilidade: 'Graduandos do BTI',
    keywords: ['Python', 'Django'],
    ...overrides,
  };
}

describe('formatEditalSummary', () => {
  it('monta todos os campos de uma vaga completa', () => {
    expect(formatEditalSummary({ vagas: [vaga()] })).toBe(
      [
        '*Vaga:* Bolsista de Desenvolvimento Web',
        '*Qtd vagas:* 2 + 4 CR',
        '*Remuneração:* R$ 700,00 (20h semanais / Tarde / Presencial)',
        '*Palavras-chaves:* Python, Django',
        '*Duração:* 12 meses',
        '*Elegibilidade:* Graduandos do BTI',
      ].join('\n'),
    );
  });

  it('deixa de fora os campos que a IA não achou', () => {
    const summary = formatEditalSummary({
      vagas: [
        vaga({
          qtdVagas: null,
          cadastroReserva: null,
          remuneração: null,
          horasSemanais: null,
          turno: null,
          formato: null,
          duracao: null,
          elegibilidade: null,
          keywords: [],
        }),
      ],
    });

    expect(summary).toBe('*Vaga:* Bolsista de Desenvolvimento Web');
  });

  it('mostra só as vagas imediatas quando não há cadastro reserva', () => {
    const summary = formatEditalSummary({
      vagas: [vaga({ cadastroReserva: null })],
    });

    expect(summary).toContain('*Qtd vagas:* 2\n');
  });

  it('mostra só o cadastro reserva quando não há vagas imediatas', () => {
    const summary = formatEditalSummary({
      vagas: [vaga({ qtdVagas: null })],
    });

    expect(summary).toContain('*Qtd vagas:* 4 CR\n');
  });

  it('separa as vagas com uma linha em branco', () => {
    const summary = formatEditalSummary({
      vagas: [vaga(), vaga({ vaga: 'Bolsista de Suporte' })],
    });

    expect(summary.split('\n\n')).toHaveLength(2);
    expect(summary).toContain('\n\n*Vaga:* Bolsista de Suporte');
  });
});
