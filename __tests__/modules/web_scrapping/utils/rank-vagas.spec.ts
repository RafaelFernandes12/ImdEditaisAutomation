import { rankVagas } from '../../../../src/modules/web_scrapping/utils/job-filter.util.js';
import { formatRankedVagas } from '../../../../src/utils/format-job-lines.js';

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
};

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

    const ranked = rankVagas({ UserPreferences: prefs }, jobs([media, forte]));

    expect(ranked.map(({ vaga }) => vaga.summary)).toEqual(['forte', 'media']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('corta vaga do GitHub abaixo da nota mínima', () => {
    const fraca = job({ vagas: [vaga({ ecossytem: 'php' })] });
    expect(rankVagas({ UserPreferences: prefs }, jobs([fraca]))).toEqual([]);
  });

  it('manda sempre as vagas das fontes locais, mesmo sem compatibilidade', () => {
    const imd = job({
      type: 'IMD',
      kind: 'EDITAL',
      vagas: [vaga({ ecossytem: 'php', senioridade: 'SENIOR' })],
    });
    expect(rankVagas({ UserPreferences: prefs }, jobs([imd]))).toHaveLength(1);
  });

  it('cadastro sem preferências recebe todas as vagas', () => {
    const fraca = job({ vagas: [vaga({ ecossytem: 'php' }), vaga()] });
    expect(rankVagas({ UserPreferences: null }, jobs([fraca]))).toHaveLength(2);
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
