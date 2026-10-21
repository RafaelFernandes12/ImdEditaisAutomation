import { vagaMatches } from '../../../../src/modules/web_scrapping/utils/job-filter.util.js';
import type { JobWeights } from '../../../../src/modules/web_scrapping/sources/job.source.js';
import { JobType } from '../../../../generated/prisma/enums.js';

type Preferences = Parameters<typeof vagaMatches>[0];
type Vaga = Parameters<typeof vagaMatches>[1];
type Weight = NonNullable<ReturnType<JobWeights['get']>>;

const NO_WEIGHT: Weight = {
  ecossytem: 0,
  escolaridade: 0,
  salary: 0,
  formato: 0,
  city: 0,
  modelo: 0,
  senioridade: 0,
  priority: 1,
};

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return {
    keyWords: 'node,react',
    formato: ['PRESENCIAL'],
    city: 'Natal',
    state: 'RN',
    modelo: ['CLT', 'PJ'],
    senioridade: ['JUNIOR', 'PLENO'],
    escolaridade: [],
    salary: 4000,
    isInternational: false,
    ...overrides,
  };
}

function vaga(overrides: Partial<Vaga> = {}): Vaga {
  return {
    keyWords: '',
    ecossytem: '',
    formato: null,
    city: null,
    state: null,
    modelo: null,
    senioridade: null,
    escolaridade: null,
    salary: null,
    isInternational: false,
    ...overrides,
  };
}

function weights(weight: Partial<Weight>, type: JobType = 'BACKEND_GITHUB') {
  return new Map([[type, { ...NO_WEIGHT, ...weight }]]) as JobWeights;
}

// Pontua com peso 1 só no critério testado, para o score ser o valor do
// próprio critério.
function score(
  field: keyof Weight,
  preferences: Preferences,
  testVaga: Vaga,
): number {
  return vagaMatches(
    preferences,
    testVaga,
    'BACKEND_GITHUB',
    weights({ [field]: 1 }),
  ).score;
}

describe('vagaMatches', () => {
  it('falha quando o tipo da vaga não tem peso', () => {
    expect(() =>
      vagaMatches(prefs(), vaga(), 'IMD', weights({ ecossytem: 1 })),
    ).toThrow();
  });

  it('multiplica a soma pela prioridade da fonte', () => {
    const result = vagaMatches(
      prefs(),
      vaga({ ecossytem: 'node' }),
      'BACKEND_GITHUB',
      weights({ ecossytem: 10, priority: 1.5 }),
    );
    expect(result.score).toBe(15);
  });

  it('devolve a vaga com o tipo e o score', () => {
    const testVaga = vaga({ ecossytem: 'node' });
    expect(
      vagaMatches(
        prefs(),
        testVaga,
        'BACKEND_GITHUB',
        weights({ ecossytem: 10 }),
      ),
    ).toEqual({ ...testVaga, type: 'BACKEND_GITHUB', score: 10 });
  });

  describe('ecossistema', () => {
    it('vale 1 quando a vaga tem um ecossistema do usuário', () => {
      expect(
        score('ecossytem', prefs(), vaga({ ecossytem: 'java, node' })),
      ).toBe(1);
    });

    it('vale 0 quando nenhum ecossistema da vaga é do usuário', () => {
      expect(score('ecossytem', prefs(), vaga({ ecossytem: 'java' }))).toBe(0);
    });

    it('vale 0 quando a vaga ou o usuário não tem ecossistema', () => {
      expect(score('ecossytem', prefs(), vaga())).toBe(0);
      expect(
        score(
          'ecossytem',
          prefs({ keyWords: '' }),
          vaga({ ecossytem: 'node' }),
        ),
      ).toBe(0);
    });
  });

  describe('senioridade', () => {
    it('vale 1 quando o nível foi escolhido', () => {
      expect(
        score('senioridade', prefs(), vaga({ senioridade: 'PLENO' })),
      ).toBe(1);
    });

    it('derruba a vaga quando o nível não foi escolhido', () => {
      expect(
        score('senioridade', prefs(), vaga({ senioridade: 'SENIOR' })),
      ).toBe(-100);
    });

    it('vale 0.5 sem nível na vaga ou no cadastro', () => {
      expect(score('senioridade', prefs(), vaga())).toBe(0.5);
      expect(
        score(
          'senioridade',
          prefs({ senioridade: [] }),
          vaga({ senioridade: 'SENIOR' }),
        ),
      ).toBe(0.5);
    });
  });

  describe('escolaridade', () => {
    const mestrado = prefs({ escolaridade: ['MESTRADO'] });

    it('vale 1 quando o nível foi escolhido e 0 quando não foi', () => {
      expect(
        score('escolaridade', mestrado, vaga({ escolaridade: 'MESTRADO' })),
      ).toBe(1);
      expect(
        score('escolaridade', mestrado, vaga({ escolaridade: 'GRADUACAO' })),
      ).toBe(0);
    });

    it('vale 0.5 sem nível na vaga ou no cadastro', () => {
      expect(score('escolaridade', mestrado, vaga())).toBe(0.5);
      expect(
        score('escolaridade', prefs(), vaga({ escolaridade: 'GRADUACAO' })),
      ).toBe(0.5);
    });
  });

  describe('modelo', () => {
    it('vale 1 quando o vínculo foi escolhido e 0 quando não foi', () => {
      expect(score('modelo', prefs(), vaga({ modelo: 'PJ' }))).toBe(1);
      expect(score('modelo', prefs(), vaga({ modelo: 'BOLSISTA' }))).toBe(0);
    });

    it('vale 0.5 sem vínculo na vaga ou no cadastro', () => {
      expect(score('modelo', prefs(), vaga())).toBe(0.5);
      expect(
        score('modelo', prefs({ modelo: [] }), vaga({ modelo: 'BOLSISTA' })),
      ).toBe(0.5);
    });
  });

  describe('formato', () => {
    it('vale 1 quando o formato foi escolhido e 0 quando não foi', () => {
      expect(score('formato', prefs(), vaga({ formato: 'PRESENCIAL' }))).toBe(
        1,
      );
      expect(score('formato', prefs(), vaga({ formato: 'REMOTO' }))).toBe(0);
    });

    it('vale 0.5 sem formato na vaga ou no cadastro', () => {
      expect(score('formato', prefs(), vaga())).toBe(0.5);
      expect(
        score('formato', prefs({ formato: [] }), vaga({ formato: 'REMOTO' })),
      ).toBe(0.5);
    });
  });

  describe('salário', () => {
    // Para 4000 a margem é de 20%: o piso fica em 3200.
    it('vale 1 a partir do salário pedido', () => {
      expect(score('salary', prefs(), vaga({ salary: 4000 }))).toBe(1);
      expect(score('salary', prefs(), vaga({ salary: 6000 }))).toBe(1);
    });

    it('cresce linearmente entre o piso e o salário pedido', () => {
      expect(score('salary', prefs(), vaga({ salary: 3600 }))).toBeCloseTo(0.5);
    });

    it('vale 0 abaixo do piso ou sem salário na vaga', () => {
      expect(score('salary', prefs(), vaga({ salary: 3000 }))).toBe(0);
      expect(score('salary', prefs(), vaga())).toBe(0);
    });
  });

  describe('local', () => {
    const remoto = prefs({ formato: ['REMOTO'] });

    it('vaga remota vale 1 para quem aceita remoto', () => {
      expect(
        score(
          'city',
          remoto,
          vaga({ formato: 'REMOTO', city: 'São Paulo', state: 'SP' }),
        ),
      ).toBe(1);
    });

    it('vaga remota derruba quem não aceita remoto', () => {
      expect(score('city', prefs(), vaga({ formato: 'REMOTO' }))).toBe(-100);
    });

    it('presencial ou híbrida vale 1 só na cidade do usuário', () => {
      expect(
        score('city', prefs(), vaga({ formato: 'PRESENCIAL', city: 'natal' })),
      ).toBe(1);
      expect(
        score('city', prefs(), vaga({ formato: 'HIBRIDO', city: 'Recife' })),
      ).toBe(-100);
    });

    it('compara a cidade sem acento e sem caixa', () => {
      expect(
        score(
          'city',
          prefs({ city: 'São Gonçalo do Amarante' }),
          vaga({ formato: 'PRESENCIAL', city: 'SAO GONCALO DO AMARANTE' }),
        ),
      ).toBe(1);
    });

    it('sem cidade, compara o estado', () => {
      expect(
        score('city', prefs(), vaga({ formato: 'PRESENCIAL', state: 'RN' })),
      ).toBe(1);
      expect(
        score('city', prefs(), vaga({ formato: 'PRESENCIAL', state: 'PE' })),
      ).toBe(-100);
    });

    it('quem só quer remoto não recebe presencial', () => {
      expect(
        score('city', remoto, vaga({ formato: 'PRESENCIAL', city: 'Natal' })),
      ).toBe(-100);
    });

    it('presencial sem local vale 0', () => {
      expect(score('city', prefs(), vaga({ formato: 'PRESENCIAL' }))).toBe(0);
    });

    it('sem formato e sem local, vale 1 só para quem aceita remoto', () => {
      expect(score('city', remoto, vaga())).toBe(1);
      expect(score('city', prefs(), vaga())).toBe(0);
    });

    it('sem formato, usa o local da vaga', () => {
      expect(score('city', prefs(), vaga({ city: 'Natal' }))).toBe(1);
      expect(score('city', prefs(), vaga({ city: 'Recife' }))).toBe(-100);
    });
  });

  describe('internacional', () => {
    it('tira 100 pontos, depois da prioridade, de quem não quer', () => {
      const result = vagaMatches(
        prefs(),
        vaga({ ecossytem: 'node', isInternational: true }),
        'BACKEND_GITHUB',
        weights({ ecossytem: 10, priority: 2 }),
      );
      expect(result.score).toBe(-80);
    });

    it('não penaliza quem aceita vaga internacional', () => {
      expect(
        score(
          'ecossytem',
          prefs({ isInternational: true }),
          vaga({ ecossytem: 'node', isInternational: true }),
        ),
      ).toBe(1);
    });
  });
});
