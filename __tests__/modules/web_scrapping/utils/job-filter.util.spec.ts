import {
  jobFilter,
  vagaMatches,
} from '../../../../src/modules/web_scrapping/utils/job-filter.util.js';

type Preferences = Parameters<typeof vagaMatches>[0];
type Vaga = Parameters<typeof vagaMatches>[1];

function prefs(overrides: Partial<Preferences> = {}): Preferences {
  return {
    keyWords: 'node,react',
    formato: ['PRESENCIAL'],
    city: 'Natal',
    state: 'RN',
    modelo: ['CLT', 'PJ'],
    senioridade: ['JUNIOR', 'PLENO'],
    escolaridade: [],
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
    ...overrides,
  };
}

describe('vagaMatches', () => {
  it('deixa passar vaga sem nenhum campo informado', () => {
    expect(vagaMatches(prefs(), vaga())).toBe(true);
  });

  describe('ecossistema', () => {
    it('passa quando a vaga tem um ecossistema do usuário', () => {
      expect(vagaMatches(prefs(), vaga({ ecossytem: 'java, node' }))).toBe(
        true,
      );
    });

    it('cai quando nenhum ecossistema da vaga é do usuário', () => {
      expect(vagaMatches(prefs(), vaga({ ecossytem: 'java' }))).toBe(false);
    });

    it('sem ecossytem, usa os termos das keywords', () => {
      expect(
        vagaMatches(prefs(), vaga({ keyWords: 'Spring Boot 3, PostgreSQL' })),
      ).toBe(false);
      expect(
        vagaMatches(prefs(), vaga({ keyWords: 'NestJS, PostgreSQL' })),
      ).toBe(true);
    });

    it('só casa termo inteiro', () => {
      // "go" não pode casar com "Google Cloud".
      expect(
        vagaMatches(
          prefs({ keyWords: 'python' }),
          vaga({ keyWords: 'Google Cloud, Python' }),
        ),
      ).toBe(true);
      expect(
        vagaMatches(
          prefs({ keyWords: 'python' }),
          vaga({ keyWords: 'Google Cloud' }),
        ),
      ).toBe(true);
    });

    it('entende o cadastro antigo, que salvava os termos', () => {
      expect(
        vagaMatches(
          prefs({ keyWords: 'javascript, typescript, node.js, nestjs' }),
          vaga({ ecossytem: 'node' }),
        ),
      ).toBe(true);
    });

    it('aceita termo no lugar da chave no ecossytem da vaga', () => {
      expect(
        vagaMatches(
          prefs({ keyWords: 'cpp' }),
          vaga({ ecossytem: 'java, c++' }),
        ),
      ).toBe(true);
    });

    it('vaga genérica (sem ecossistema identificável) passa', () => {
      expect(
        vagaMatches(prefs(), vaga({ keyWords: 'atendimento, suporte' })),
      ).toBe(true);
    });
  });

  describe('senioridade', () => {
    it('cai quando o nível de mercado não foi escolhido', () => {
      expect(vagaMatches(prefs(), vaga({ senioridade: 'SENIOR' }))).toBe(false);
      expect(vagaMatches(prefs(), vaga({ senioridade: 'PLENO' }))).toBe(true);
    });

    it('sem senioridade escolhida, não filtra', () => {
      expect(
        vagaMatches(
          prefs({ senioridade: [] }),
          vaga({ senioridade: 'SENIOR' }),
        ),
      ).toBe(true);
    });
  });

  describe('escolaridade', () => {
    it('sem escolaridade escolhida, não filtra', () => {
      expect(vagaMatches(prefs(), vaga({ escolaridade: 'GRADUACAO' }))).toBe(
        true,
      );
    });

    it('cai quando o nível acadêmico não foi escolhido', () => {
      const mestrado = prefs({ escolaridade: ['MESTRADO'] });
      expect(vagaMatches(mestrado, vaga({ escolaridade: 'GRADUACAO' }))).toBe(
        false,
      );
      expect(vagaMatches(mestrado, vaga({ escolaridade: 'MESTRADO' }))).toBe(
        true,
      );
    });

    it('vaga sem escolaridade passa', () => {
      const mestrado = prefs({ escolaridade: ['MESTRADO'] });
      expect(vagaMatches(mestrado, vaga())).toBe(true);
    });
  });

  describe('modelo', () => {
    it('cai quando o vínculo não foi escolhido', () => {
      expect(vagaMatches(prefs(), vaga({ modelo: 'BOLSISTA' }))).toBe(false);
      expect(vagaMatches(prefs(), vaga({ modelo: 'PJ' }))).toBe(true);
    });

    it('sem modelo escolhido, não filtra', () => {
      expect(
        vagaMatches(prefs({ modelo: [] }), vaga({ modelo: 'BOLSISTA' })),
      ).toBe(true);
    });
  });

  describe('local', () => {
    it('vaga remota passa para qualquer um', () => {
      expect(
        vagaMatches(
          prefs(),
          vaga({ formato: 'REMOTO', city: 'São Paulo', state: 'SP' }),
        ),
      ).toBe(true);
    });

    it('presencial ou híbrida passa só na cidade do usuário', () => {
      expect(
        vagaMatches(prefs(), vaga({ formato: 'PRESENCIAL', city: 'natal' })),
      ).toBe(true);
      expect(
        vagaMatches(prefs(), vaga({ formato: 'HIBRIDO', city: 'Recife' })),
      ).toBe(false);
    });

    it('compara a cidade sem acento e sem caixa', () => {
      expect(
        vagaMatches(
          prefs({ city: 'São Gonçalo do Amarante' }),
          vaga({ formato: 'PRESENCIAL', city: 'SAO GONCALO DO AMARANTE' }),
        ),
      ).toBe(true);
    });

    it('sem cidade, compara o estado', () => {
      expect(
        vagaMatches(prefs(), vaga({ formato: 'PRESENCIAL', state: 'RN' })),
      ).toBe(true);
      expect(
        vagaMatches(prefs(), vaga({ formato: 'PRESENCIAL', state: 'PE' })),
      ).toBe(false);
    });

    it('quem só quer remoto não recebe presencial nem híbrida', () => {
      const remoto = prefs({ formato: ['REMOTO'] });
      expect(
        vagaMatches(remoto, vaga({ formato: 'PRESENCIAL', city: 'Natal' })),
      ).toBe(false);
      expect(vagaMatches(remoto, vaga({ formato: 'REMOTO' }))).toBe(true);
    });

    it('formato não informado passa', () => {
      expect(vagaMatches(prefs(), vaga({ city: 'Recife' }))).toBe(true);
    });
  });
});

describe('jobFilter', () => {
  const user = { UserPreferences: prefs() };

  it('mantém no edital só os perfis que servem para o usuário', () => {
    const coordenador = vaga({ senioridade: 'SENIOR' });
    const bolsista = vaga({ senioridade: 'JUNIOR' });

    expect(
      jobFilter(user, [{ id: 1, vagas: [coordenador, bolsista] }]),
    ).toEqual([{ id: 1, vagas: [bolsista] }]);
  });

  it('tira o job quando nenhuma vaga serve', () => {
    expect(
      jobFilter(user, [{ id: 1, vagas: [vaga({ ecossytem: 'java' })] }]),
    ).toEqual([]);
  });

  it('mantém job sem vagas', () => {
    expect(jobFilter(user, [{ id: 1, vagas: [] }])).toEqual([
      { id: 1, vagas: [] },
    ]);
  });

  it('não filtra usuário sem preferências', () => {
    const jobs = [{ id: 1, vagas: [vaga({ ecossytem: 'java' })] }];
    expect(jobFilter({ UserPreferences: null }, jobs)).toBe(jobs);
  });
});
