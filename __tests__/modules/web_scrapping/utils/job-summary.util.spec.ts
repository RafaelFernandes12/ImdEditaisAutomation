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
    moeda: null,
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
        '*Vaga:* Desenvolvedor Backend | Natal/RN',
        '*Senioridade:* Pleno',
        '*Remuneração:* R$ 3.500,50 (40h semanais / Remoto / CLT)',
        '*Palavras-chaves:* Node.js, PostgreSQL',
        '*Elegibilidade:* 3 anos de experiência com Node.js',
      ].join('\n'),
    );
  });

  it('monta todos os campos de uma bolsa de edital', () => {
    expect(formatVaga(bolsa())).toBe(
      [
        '*Vaga:* Bolsista de Desenvolvimento Web | Natal/RN',
        '*Senioridade:* Graduação',
        '*Remuneração:* R$ 700,00 (20h semanais / Tarde / Presencial / Bolsista)',
        '*Palavras-chaves:* Python, Django',
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

  it('põe a localização na linha da vaga e a escolaridade na da senioridade', () => {
    const summary = formatVaga(
      vaga({ senioridade: 'JUNIOR', escolaridade: 'GRADUACAO', cidade: null }),
    );

    expect(summary).toMatch(
      /^\*Vaga:\* Desenvolvedor Backend \| RN\n\*Senioridade:\* Júnior \| Graduação\n/,
    );
  });

  it('não mostra quantidade de vagas nem duração', () => {
    const summary = formatVaga(bolsa());

    expect(summary).not.toContain('Qtd vagas');
    expect(summary).not.toContain('Duração');
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
    expect(formatVaga(vaga({ cidade: null }))).toMatch(
      /^\*Vaga:\* Desenvolvedor Backend \| RN\n/,
    );
    expect(formatVaga(vaga({ cidade: null, estado: null }))).toMatch(
      /^\*Vaga:\* Desenvolvedor Backend\n/,
    );
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
    expect(vagas[0].summary).toMatch(
      /^\*Vaga:\* Desenvolvedor Backend \| Natal\/RN\n/,
    );
    expect(vagas[1]).toMatchObject({
      keyWords: 'Python',
      escolaridade: 'GRADUACAO',
      modelo: 'BOLSISTA',
    });
    expect(vagas[1].summary).toMatch(
      /^\*Vaga:\* Bolsista de IA \| Natal\/RN\n/,
    );
    expect(vagas[1].summary).not.toContain('Desenvolvedor Backend');
  });

  it('descarta perfil fora de tecnologia e perfil sem cargo', () => {
    const vagas = toVagas({
      vagas: [
        vaga({ isTech: false, vaga: 'Vendedor(a) B2B' }),
        vaga({ vaga: null }),
        bolsa(),
      ],
    });

    expect(vagas).toHaveLength(1);
    expect(vagas[0].summary).toMatch(
      /^\*Vaga:\* Bolsista de Desenvolvimento Web \| Natal\/RN\n/,
    );
  });

  it('devolve lista vazia quando o texto não é anúncio de vaga', () => {
    expect(toVagas({ vagas: [] })).toEqual([]);
  });
});

describe('remuneração em outra moeda', () => {
  const dolar = vaga({ remuneração: 1000, moeda: 'USD' });

  it('converte o salário para reais e mostra o valor original no resumo', () => {
    const [convertida] = toVagas({ vagas: [dolar] }, { USD: 5.06 });

    expect(convertida.salary).toBe(5060);
    expect(convertida.summary).toContain(
      '*Remuneração:* US$ 1.000,00 ≈ R$ 5.060,00 (',
    );
  });

  it('sem cotação, mantém o valor original e não grava salário', () => {
    const [semCotacao] = toVagas({ vagas: [dolar] });

    expect(semCotacao.salary).toBeNull();
    expect(semCotacao.summary).toContain('*Remuneração:* US$ 1.000,00 (');
    expect(semCotacao.summary).not.toContain('≈');
  });

  it('real (ou moeda não informada) não muda', () => {
    for (const moeda of ['BRL', null]) {
      const [real] = toVagas({ vagas: [vaga({ moeda })] }, { USD: 5.06 });
      expect(real.salary).toBe(3500.5);
      expect(real.summary).toContain('*Remuneração:* R$ 3.500,50 (');
    }
  });
});

describe('vagaKeywords', () => {
  it('limpa as palavras-chave sem repetir', () => {
    expect(
      vagaKeywords(vaga({ keywords: [' React ', 'Node.js', '', 'React'] })),
    ).toEqual(['React', 'Node.js']);
  });
});
