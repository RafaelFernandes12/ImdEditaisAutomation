import {
  formatJobSummary,
  vagaKeywords,
} from '../../../../src/modules/web_scrapping/utils/job-summary.util.js';
import type { VagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job.service.js';

function vaga(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return {
    vaga: 'Desenvolvedor Backend',
    senioridade: 'Pleno',
    qtdVagas: 2,
    cadastroReserva: null,
    remuneração: 3500.5,
    horasSemanais: 40,
    turno: null,
    formato: 'Remoto',
    modalidade: 'CLT',
    cidade: 'Natal',
    estado: 'RN',
    duracao: null,
    elegibilidade: '3 anos de experiência com Node.js',
    keywords: ['Node.js', 'PostgreSQL'],
    ecossystems: '',
    ...overrides,
  };
}

function bolsa(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return vaga({
    vaga: 'Bolsista de Desenvolvimento Web',
    senioridade: 'Graduação',
    qtdVagas: 2,
    cadastroReserva: 4,
    remuneração: 700,
    horasSemanais: 20,
    turno: 'Tarde',
    formato: 'Presencial',
    modalidade: 'Bolsista',
    duracao: '12 meses',
    elegibilidade: 'Graduandos do BTI',
    keywords: ['Python', 'Django'],
    ...overrides,
  });
}

describe('formatJobSummary', () => {
  it('monta todos os campos de uma vaga de emprego', () => {
    expect(formatJobSummary({ vagas: [vaga()] })).toBe(
      [
        '*Vaga:* Desenvolvedor Backend',
        '*Senioridade:* Pleno',
        '*Qtd vagas:* 2',
        '*Remuneração:* R$ 3.500,50 (40h semanais / Remoto / CLT)',
        '*Localização:* Natal / RN',
        '*Palavras-chaves:* Node.js, PostgreSQL',
        '*Elegibilidade:* 3 anos de experiência com Node.js',
      ].join('\n'),
    );
  });

  it('monta todos os campos de uma bolsa de edital', () => {
    expect(formatJobSummary({ vagas: [bolsa()] })).toBe(
      [
        '*Vaga:* Bolsista de Desenvolvimento Web',
        '*Senioridade:* Graduação',
        '*Qtd vagas:* 2 + 4 CR',
        '*Remuneração:* R$ 700,00 (20h semanais / Tarde / Presencial / Bolsista)',
        '*Localização:* Natal / RN',
        '*Palavras-chaves:* Python, Django',
        '*Duração:* 12 meses',
        '*Elegibilidade:* Graduandos do BTI',
      ].join('\n'),
    );
  });

  it('deixa de fora os campos que a IA não achou', () => {
    const summary = formatJobSummary({
      vagas: [
        bolsa({
          senioridade: null,
          qtdVagas: null,
          cadastroReserva: null,
          remuneração: null,
          horasSemanais: null,
          turno: null,
          formato: null,
          modalidade: null,
          cidade: null,
          estado: null,
          duracao: null,
          elegibilidade: null,
          keywords: [],
        }),
      ],
    });

    expect(summary).toBe('*Vaga:* Bolsista de Desenvolvimento Web');
  });

  it('mostra só as vagas imediatas quando não há cadastro reserva', () => {
    const summary = formatJobSummary({
      vagas: [bolsa({ cadastroReserva: null })],
    });

    expect(summary).toContain('*Qtd vagas:* 2\n');
  });

  it('mostra só o cadastro reserva quando não há vagas imediatas', () => {
    const summary = formatJobSummary({ vagas: [bolsa({ qtdVagas: null })] });

    expect(summary).toContain('*Qtd vagas:* 4 CR\n');
  });

  it('mostra as condições mesmo sem o valor da remuneração', () => {
    const summary = formatJobSummary({
      vagas: [vaga({ remuneração: null, horasSemanais: null })],
    });

    expect(summary).toContain('*Remuneração:* não informada (Remoto / CLT)');
  });

  it('mostra o valor sem parênteses quando não há condições', () => {
    const summary = formatJobSummary({
      vagas: [vaga({ horasSemanais: null, formato: null, modalidade: null })],
    });

    expect(summary).toContain('*Remuneração:* R$ 3.500,50\n');
  });

  it('mostra só a parte da localização que existe', () => {
    const summary = formatJobSummary({ vagas: [vaga({ cidade: null })] });

    expect(summary).toContain('*Localização:* RN');
  });

  it('separa as vagas com uma linha em branco', () => {
    const summary = formatJobSummary({
      vagas: [vaga(), vaga({ vaga: 'Desenvolvedor Frontend' })],
    });

    expect(summary.split('\n\n')).toHaveLength(2);
    expect(summary).toContain('\n\n*Vaga:* Desenvolvedor Frontend');
  });
});

describe('vagaKeywords', () => {
  it('junta as palavras-chave de todas as vagas sem repetir', () => {
    expect(
      vagaKeywords({
        vagas: [
          vaga({ keywords: ['Node.js', 'PostgreSQL'] }),
          vaga({ keywords: [' React ', 'Node.js', ''] }),
        ],
      }),
    ).toEqual(['Node.js', 'PostgreSQL', 'React']);
  });
});
