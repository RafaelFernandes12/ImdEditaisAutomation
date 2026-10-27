jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

import { SolidesSource } from '../../../../src/modules/web_scrapping/sources/solides.source.js';
import type { SolidesJob } from '../../../../src/modules/web_scrapping/models/solides.js';
import type { ActiveJob } from '../../../../src/modules/jobs/services/jobs.service.js';
import type { PinoLogger } from 'nestjs-pino';

const DAY_MS = 24 * 60 * 60 * 1000;

function day(offsetDays: number) {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** Vaga no formato que a API do portal devolve. */
function solidesJob(overrides: Partial<SolidesJob> = {}): SolidesJob {
  return {
    id: 1,
    title: 'Desenvolvedor Backend Node ',
    description:
      '<p>Manter as APIs da plataforma.</p><ul><li>Node.js</li><li>PostgreSQL</li></ul>',
    companyName: 'Empresa',
    city: { name: 'Natal' },
    state: { name: 'Rio Grande do Norte', code: 'RN' },
    jobType: 'presencial',
    salary: {
      type: 'range',
      showRangeToApplicant: true,
      initialRange: 3100,
      finalRange: 4100,
      negotiable: false,
    },
    seniority: [{ id: 5, name: 'Pleno' }],
    recruitmentContractType: [{ id: 10, name: 'CLT' }],
    hardSkills: [{ id: 1, name: 'NestJS' }],
    createdAt: day(-1),
    date: { due: day(30), show: true },
    publishers: null,
    ...overrides,
  };
}

function mockFetchOnce(
  data: SolidesJob[] | undefined,
  init: {
    ok?: boolean;
    status?: number;
    totalPages?: number;
    error?: string;
  } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(
      data === undefined
        ? {}
        : {
            count: data.length,
            currentPage: 1,
            totalPages: init.totalPages ?? 1,
            data,
            ...(init.error && { error: init.error }),
          },
    ),
  });
}

/** Recorte do ActiveJob que o findFinished usa. */
function activeJob(
  id: number,
  type: string,
  subscriptionUntil: Date | null,
  publishedAt: Date = new Date(),
) {
  return {
    id,
    type,
    subscriptionUntil,
    publishedAt,
    created_at: publishedAt,
  } as unknown as ActiveJob;
}

describe('SolidesSource', () => {
  let service: SolidesSource;

  beforeEach(() => {
    global.fetch = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new SolidesSource(logger as unknown as PinoLogger);
  });

  describe('list', () => {
    it('busca as vagas de Natal e monta o link da página no portal', async () => {
      mockFetchOnce([solidesJob({ id: 941789 })]);

      const listed = await service.list();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = jest.mocked(global.fetch).mock.calls[0] as [URL];
      expect(url.searchParams.get('locations')).toBe('Natal - RN');
      expect(url.searchParams.get('take')).toBe('25');
      expect(listed).toEqual([
        expect.objectContaining({
          link: 'https://vagas.solides.com.br/vaga/941789',
          type: 'SOLIDES',
        }),
      ]);
    });

    it('usa o link do RH Gestor na vaga publicada por lá', async () => {
      mockFetchOnce([
        solidesJob({
          id: 'LJ3jMrtmTe',
          publishers: {
            rhgestor: {
              redirectUrl: 'https://empresa.rhgestor.com.br/vagas/detalhes/abc',
            },
          },
        }),
      ]);

      const [job] = await service.list();

      expect(job.link).toBe(
        'https://empresa.rhgestor.com.br/vagas/detalhes/abc',
      );
    });

    it('segue para a próxima página enquanto as vagas são recentes', async () => {
      mockFetchOnce([solidesJob({ id: 1 })], { totalPages: 5 });
      mockFetchOnce(
        [solidesJob({ id: 2 }), solidesJob({ id: 3, createdAt: day(-40) })],
        {
          totalPages: 5,
        },
      );

      const listed = await service.list();

      // Para na página que passa dos 30 dias e deixa de fora a vaga antiga.
      expect(global.fetch).toHaveBeenCalledTimes(2);
      const [, [secondUrl]] = jest.mocked(global.fetch).mock.calls as [URL][];
      expect(secondUrl.searchParams.get('page')).toBe('2');
      expect(listed.map((job) => job.solides.id)).toEqual([1, 2]);
    });

    it('deixa de fora a vaga com as inscrições encerradas', async () => {
      mockFetchOnce([
        solidesJob({ id: 1, date: { due: day(-1), show: false } }),
        solidesJob({ id: 2, date: { due: null, show: true } }),
        solidesJob({ id: 3, date: null }),
      ]);

      const listed = await service.list();

      expect(listed.map((job) => job.solides.id)).toEqual([2, 3]);
    });

    it('falha a fonte quando a API responde erro', async () => {
      mockFetchOnce([], { ok: false, status: 429 });

      await expect(service.list()).rejects.toThrow('429');
    });

    it('falha a fonte quando a API devolve o erro com status 200', async () => {
      mockFetchOnce([], { error: 'Failed to fetch vacancies' });

      await expect(service.list()).rejects.toThrow('Failed to fetch vacancies');
    });

    it('falha a fonte quando a resposta vem sem a lista de vagas', async () => {
      mockFetchOnce(undefined);

      await expect(service.list()).rejects.toThrow('sem a lista de vagas');
    });
  });

  describe('fetchDetails', () => {
    const listed = (overrides: Partial<SolidesJob> = {}) => {
      const solides = solidesJob(overrides);
      return {
        link: `https://vagas.solides.com.br/vaga/${solides.id}`,
        type: 'SOLIDES' as const,
        solides,
      };
    };

    it('monta o payload com a descrição da listagem, prazo e atributos', async () => {
      const due = day(30);

      const [payload] = await service.fetchDetails([listed({ id: 7 })]);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(payload).toEqual({
        title: 'Desenvolvedor Backend Node',
        type: 'SOLIDES',
        link: 'https://vagas.solides.com.br/vaga/7',
        description: [
          'Empresa: Empresa',
          'Local: Natal - RN',
          'Modalidade: Presencial',
          'Contrato: CLT',
          'Senioridade: Pleno',
          'Salário: R$ 3100',
          'Manter as APIs da plataforma.',
          'Node.js',
          'PostgreSQL',
          'Conhecimentos: NestJS',
        ].join('\n'),
        isActive: true,
        publishedAt: day(-1),
        subscriptionUntil: `${due}T23:59:59-03:00`,
        attributes: {
          formato: 'PRESENCIAL',
          senioridade: 'PLENO',
          modelo: 'CLT',
          salary: 3100,
          city: 'Natal',
          state: 'RN',
          isInternational: false,
        },
      });
    });

    it('descarta a vaga que cita menos de dois termos de tecnologia', async () => {
      const payloads = await service.fetchDetails([
        listed({
          id: 1,
          title: 'Vendedor(a) de Loja',
          description: '<p>Atendimento ao cliente.</p>',
          hardSkills: [],
        }),
        listed({ id: 2 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        'https://vagas.solides.com.br/vaga/2',
      ]);
    });

    it('deixa para a IA o que a Sólides não informa ou deixa ambíguo', async () => {
      const [payload] = await service.fetchDetails([
        listed({
          jobType: 'remoto',
          seniority: [
            { id: 4, name: 'Junior' },
            { id: 5, name: 'Pleno' },
          ],
          recruitmentContractType: [
            { id: 10, name: 'CLT' },
            { id: 11, name: 'PJ' },
          ],
          salary: {
            type: 'simple',
            showRangeToApplicant: false,
            initialRange: 5000,
            finalRange: 5000,
            negotiable: false,
          },
          date: { due: null, show: true },
        }),
      ]);

      expect(payload.subscriptionUntil).toBeUndefined();
      expect(payload.attributes).toEqual({
        formato: 'REMOTO',
        city: 'Natal',
        state: 'RN',
        isInternational: false,
      });
    });

    it('marca estágio no modelo e na senioridade', async () => {
      const [payload] = await service.fetchDetails([
        listed({
          seniority: [{ id: 1, name: 'Estagiário' }],
          recruitmentContractType: [{ id: 10, name: 'CLT' }],
        }),
      ]);

      expect(payload.attributes).toMatchObject({
        modelo: 'ESTAGIO',
        senioridade: 'ESTAGIO',
      });
    });

    it('segue com as outras vagas quando o processamento de uma lança erro', async () => {
      const payloads = await service.fetchDetails([
        listed({ id: 1, title: undefined as unknown as string }),
        listed({ id: 2 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        'https://vagas.solides.com.br/vaga/2',
      ]);
    });
  });

  describe('findFinished', () => {
    it('encerra pelo fim das inscrições ou pela idade, só as da Sólides', async () => {
      const yesterday = new Date(Date.now() - DAY_MS);
      const tomorrow = new Date(Date.now() + DAY_MS);
      const old = new Date(Date.now() - 31 * DAY_MS);

      const finished = await service.findFinished([
        activeJob(1, 'SOLIDES', yesterday),
        activeJob(2, 'SOLIDES', tomorrow),
        activeJob(3, 'SOLIDES', null),
        activeJob(4, 'SOLIDES', tomorrow, old),
        activeJob(5, 'GUPY', yesterday),
      ]);

      expect(finished).toEqual([{ id: 1 }, { id: 4 }]);
    });
  });
});
