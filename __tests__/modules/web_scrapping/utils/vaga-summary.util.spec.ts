import {
  formatVagaSummary,
  vagaKeywords,
} from '../../../../src/modules/web_scrapping/utils/vaga-summary.util.js';
import type { VagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job-vaga.service.js';

function vaga(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return {
    vaga: 'Desenvolvedor Backend',
    senioridade: 'Pleno',
    qtdVagas: 2,
    remuneração: 3500.5,
    horasSemanais: 40,
    formato: 'Remoto',
    modalidade: 'CLT',
    cidade: 'Natal',
    estado: 'RN',
    keywords: ['Node.js', 'PostgreSQL'],
    ...overrides,
  };
}

describe('formatVagaSummary', () => {
  it('monta todos os campos de uma vaga completa', () => {
    expect(formatVagaSummary({ vagas: [vaga()] })).toBe(
      [
        '*Vaga:* Desenvolvedor Backend',
        '*Senioridade:* Pleno',
        '*Qtd vagas:* 2',
        '*Remuneração:* R$ 3.500,50 (40h semanais / Remoto / CLT)',
        '*Localização:* Natal / RN',
        '*Palavras-chaves:* Node.js, PostgreSQL',
      ].join('\n'),
    );
  });

  it('deixa de fora os campos que a IA não achou', () => {
    const summary = formatVagaSummary({
      vagas: [
        vaga({
          senioridade: null,
          qtdVagas: null,
          remuneração: null,
          horasSemanais: null,
          formato: null,
          modalidade: null,
          cidade: null,
          estado: null,
          keywords: [],
        }),
      ],
    });

    expect(summary).toBe('*Vaga:* Desenvolvedor Backend');
  });

  it('trata "Não informado" na senioridade como ausente', () => {
    const summary = formatVagaSummary({
      vagas: [vaga({ senioridade: 'Não informado' })],
    });

    expect(summary).not.toContain('Senioridade');
  });

  it('mostra as condições mesmo sem o valor da remuneração', () => {
    const summary = formatVagaSummary({
      vagas: [vaga({ remuneração: null, horasSemanais: null })],
    });

    expect(summary).toContain('*Remuneração:* não informada (Remoto / CLT)');
  });

  it('mostra o valor sem parênteses quando não há condições', () => {
    const summary = formatVagaSummary({
      vagas: [vaga({ horasSemanais: null, formato: null, modalidade: null })],
    });

    expect(summary).toContain('*Remuneração:* R$ 3.500,50\n');
  });

  it('mostra só a parte da localização que existe', () => {
    const summary = formatVagaSummary({ vagas: [vaga({ cidade: null })] });

    expect(summary).toContain('*Localização:* RN');
  });

  it('separa as vagas com uma linha em branco', () => {
    const summary = formatVagaSummary({
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
