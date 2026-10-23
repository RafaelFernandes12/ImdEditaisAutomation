import {
  rankVagas,
  vagaMatches,
} from '../../../../src/modules/web_scrapping/utils/job-filter.util.js';
import { formatRankedVagas } from '../../../../src/utils/format-job-lines.js';
import type { JobWeights } from '../../../../src/modules/web_scrapping/sources/job.source.js';

type Jobs = Parameters<typeof rankVagas>[1];
type Preferences = NonNullable<
  Parameters<typeof rankVagas>[0]['UserPreferences']
>;

const prefs: Preferences = {
  keyWords: 'java,react',
  formato: ['REMOTO'],
  city: 'Natal',
  state: 'RN',
  modelo: ['CLT', 'PJ'],
  senioridade: ['JUNIOR', 'PLENO'],
  escolaridade: [],
  salary: 3000,
  isInternational: true,
};

// Mesmos pesos das sources do GitHub e do IMD.
const weights: JobWeights = new Map([
  [
    'BACKEND_GITHUB',
    {
      ecossytem: 40,
      escolaridade: 10,
      salary: 5,
      formato: 5,
      city: 1,
      modelo: 4,
      senioridade: 30,
      priority: 1,
    },
  ],
  [
    'IMD',
    {
      ecossytem: 65,
      escolaridade: 20,
      salary: 5,
      formato: 5,
      city: 0,
      modelo: 5,
      senioridade: 0,
      priority: 1.4,
    },
  ],
]);

let nextId = 1;
function vaga(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId++,
    jobId: 0,
    summary: '*Vaga:* Desenvolvedor',
    keyWords: '',
    ecossytem: '',
    escolaridade: null,
    salary: null,
    formato: 'REMOTO',
    city: null,
    state: null,
    modelo: 'CLT',
    senioridade: 'PLENO',
    isInternational: false,
    ...overrides,
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId++,
    title: 'Job',
    link: 'https://job',
    type: 'BACKEND_GITHUB',
    kind: 'VAGA',
    subscriptionUntil: null,
    pdfs: [],
    vagas: [vaga()],
    ...overrides,
  };
}

const jobs = (list: ReturnType<typeof job>[]) => list as unknown as Jobs;

describe('rankVagas', () => {
  it('ordena da vaga mais compatível para a menos compatível', () => {
    const forte = job({
      vagas: [vaga({ ecossytem: 'java', summary: 'forte' })],
    });
    const media = job({
      vagas: [
        vaga({ ecossytem: 'react', senioridade: null, summary: 'media' }),
      ],
    });

    const ranked = rankVagas(
      { UserPreferences: prefs },
      jobs([media, forte]),
      weights,
    );

    expect(ranked.map(({ vaga }) => vaga.summary)).toEqual(['forte', 'media']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('corta vaga do GitHub abaixo da nota mínima', () => {
    const fraca = job({ vagas: [vaga({ ecossytem: 'php' })] });
    expect(
      rankVagas({ UserPreferences: prefs }, jobs([fraca]), weights),
    ).toEqual([]);
  });

  it('manda sempre as vagas das fontes locais, mesmo sem compatibilidade', () => {
    const imd = job({
      type: 'IMD',
      kind: 'EDITAL',
      vagas: [vaga({ ecossytem: 'php', senioridade: 'SENIOR' })],
    });
    expect(
      rankVagas({ UserPreferences: prefs }, jobs([imd]), weights),
    ).toHaveLength(1);
  });

  it('tira 100 pontos da vaga internacional de quem não quer internacional', () => {
    const internacional = job({
      vagas: [vaga({ ecossytem: 'java', isInternational: true })],
    });
    const aceita = rankVagas(
      { UserPreferences: prefs },
      jobs([internacional]),
      weights,
    );
    const naoAceita = rankVagas(
      { UserPreferences: { ...prefs, isInternational: false } },
      jobs([internacional]),
      weights,
    );

    expect(aceita).toHaveLength(1);
    expect(naoAceita).toEqual([]);

    const vagaInternacional = vaga({
      ecossytem: 'java',
      isInternational: true,
    });
    const pontos = (isInternational: boolean) =>
      vagaMatches(
        { ...prefs, isInternational },
        vagaInternacional as never,
        'BACKEND_GITHUB',
        weights,
      ).score;
    expect(pontos(true) - pontos(false)).toBe(100);
  });

  it('não penaliza vaga nacional de quem não quer internacional', () => {
    const nacional = job({ vagas: [vaga({ ecossytem: 'java' })] });
    const [aceita] = rankVagas(
      { UserPreferences: prefs },
      jobs([nacional]),
      weights,
    );
    const [naoAceita] = rankVagas(
      { UserPreferences: { ...prefs, isInternational: false } },
      jobs([nacional]),
      weights,
    );

    expect(naoAceita.score).toBe(aceita.score);
  });

  it('multiplica por 1.5 o score da vaga em Natal, de qualquer fonte', () => {
    const pontos = (city: string | null) =>
      vagaMatches(
        prefs,
        vaga({ ecossytem: 'java', city }) as never,
        'BACKEND_GITHUB',
        weights,
      ).score;

    expect(pontos('NATAL')).toBe(pontos(null) * 1.5);
    expect(pontos('Mossoró')).toBe(pontos(null));
  });

  it('cadastro sem preferências recebe todas as vagas', () => {
    const fraca = job({ vagas: [vaga({ ecossytem: 'php' }), vaga()] });
    expect(
      rankVagas({ UserPreferences: null }, jobs([fraca]), weights),
    ).toHaveLength(2);
  });
});

describe('formatRankedVagas', () => {
  it('numera cada vaga, põe a fonte na linha do cargo e o link logo abaixo', () => {
    const github = job({ link: 'https://github.com/issue/1' });
    const edital = job({
      kind: 'EDITAL',
      type: 'IMD',
      link: 'https://imd/edital',
      subscriptionUntil: new Date('2026-10-30T12:00:00Z'),
      pdfs: [
        { link: 'https://imd/edital.pdf' },
        { link: 'https://imd/resultado.pdf' },
      ],
      vagas: [
        vaga({ summary: '*Vaga:* Web | Natal/RN\n*Senioridade:* Júnior' }),
        vaga({ summary: '*Vaga:* Dados' }),
      ],
    });

    const message = formatRankedVagas([
      { job: github as never, vaga: github.vagas[0] },
      { job: edital as never, vaga: edital.vagas[0] },
      { job: edital as never, vaga: edital.vagas[1] },
    ]);

    expect(message).toBe(
      '*1.* *Vaga:* Desenvolvedor | GitHub Backend\n🔗 https://github.com/issue/1\n\n' +
        '*2.* *Vaga:* Web | Natal/RN | IMD\n*Senioridade:* Júnior\n🗓️ Inscrições até: 30/10/2026\n🔗 https://imd/edital.pdf\n\n' +
        '*3.* *Vaga:* Dados | IMD\n🗓️ Inscrições até: 30/10/2026\n🔗 https://imd/edital.pdf',
    );
  });
});
