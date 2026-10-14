import {
  formatVaga,
  toVagas,
  vagaKeywords,
} from '../../../../src/modules/web_scrapping/utils/job-summary.util.js';
import type { VagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job.service.js';

function vaga(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return {
    isTech: true,
    vaga: 'Desenvolvedor Backend',
    senioridade: 'PLENO',
    escolaridade: null,
    qtdVagas: 2,
    cadastroReserva: null,
    remuneração: 3500.5,
    horasSemanais: 40,
    turno: null,
    formato: 'REMOTO',
    modalidade: 'CLT',
    cidade: 'Natal',
    estado: 'RN',
    duracao: null,
    elegibilidade: '3 anos de experiência com Node.js',
    keywords: ['Node.js', 'PostgreSQL'],
    ecossystems: [],
    ...overrides,
  };
}

function bolsa(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return vaga({
    vaga: 'Bolsista de Desenvolvimento Web',
    senioridade: null,
    escolaridade: 'GRADUACAO',
    qtdVagas: 2,
    cadastroReserva: 4,
    remuneração: 700,
    horasSemanais: 20,
    turno: 'Tarde',
    formato: 'PRESENCIAL',
    modalidade: 'BOLSISTA',
    duracao: '12 meses',
    elegibilidade: 'Graduandos do BTI',
    keywords: ['Python', 'Django'],
    ...overrides,
  });
}

describe('formatVaga', () => {
  it('monta todos os campos de uma vaga de emprego', () => {
    expect(formatVaga(vaga())).toBe(
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
    expect(formatVaga(bolsa())).toBe(
      [
        '*Vaga:* Bolsista de Desenvolvimento Web',
        '*Escolaridade:* Graduação',
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
    const summary = formatVaga(
      bolsa({
        senioridade: null,
        qtdVagas: null,
        escolaridade: null,
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
    );

    expect(summary).toBe('*Vaga:* Bolsista de Desenvolvimento Web');
  });

  it('mostra só as vagas imediatas quando não há cadastro reserva', () => {
    const summary = formatVaga(bolsa({ cadastroReserva: null }));

    expect(summary).toContain('*Qtd vagas:* 2\n');
  });

  it('mostra só o cadastro reserva quando não há vagas imediatas', () => {
    const summary = formatVaga(bolsa({ qtdVagas: null }));

    expect(summary).toContain('*Qtd vagas:* 4 CR\n');
  });

  it('mostra as condições mesmo sem o valor da remuneração', () => {
    const summary = formatVaga(
      vaga({ remuneração: null, horasSemanais: null }),
    );

    expect(summary).toContain('*Remuneração:* não informada (Remoto / CLT)');
  });

  it('mostra o valor sem parênteses quando não há condições', () => {
    const summary = formatVaga(
      vaga({ horasSemanais: null, formato: null, modalidade: null }),
    );

    expect(summary).toContain('*Remuneração:* R$ 3.500,50\n');
  });

  it('mostra só a parte da localização que existe', () => {
    const summary = formatVaga(vaga({ cidade: null }));

    expect(summary).toContain('*Localização:* RN');
  });
});

describe('toVagas', () => {
  it('gera uma vaga por perfil, cada uma com o seu resumo e keywords', () => {
    const vagas = toVagas({
      vagas: [
        vaga({ keywords: ['Node.js', ' PostgreSQL ', 'Node.js', ''] }),
        bolsa({ vaga: 'Bolsista de IA', keywords: ['Python'] }),
      ],
    });

    expect(vagas).toHaveLength(2);
    expect(vagas[0]).toMatchObject({
      keyWords: 'Node.js, PostgreSQL',
      senioridade: 'PLENO',
      modelo: 'CLT',
      salary: 3500.5,
    });
    expect(vagas[0].summary).toMatch(/^\*Vaga:\* Desenvolvedor Backend\n/);
    expect(vagas[1]).toMatchObject({
      keyWords: 'Python',
      escolaridade: 'GRADUACAO',
      modelo: 'BOLSISTA',
    });
    expect(vagas[1].summary).toMatch(/^\*Vaga:\* Bolsista de IA\n/);
    expect(vagas[1].summary).not.toContain('Desenvolvedor Backend');
  });
});

describe('vagaKeywords', () => {
  it('limpa as palavras-chave sem repetir', () => {
    expect(
      vagaKeywords(vaga({ keywords: [' React ', 'Node.js', '', 'React'] })),
    ).toEqual(['React', 'Node.js']);
  });
});
