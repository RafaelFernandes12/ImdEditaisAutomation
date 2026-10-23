jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

import { SeniorSource } from '../../../../src/modules/web_scrapping/sources/senior.source.js';
import type {
  SeniorCompany,
  SeniorVacancy,
  SeniorVacancyDetails,
} from '../../../../src/modules/web_scrapping/models/senior.js';
import type { PinoLogger } from 'nestjs-pino';

const API_URL =
  'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/anonymous/rest/hcm/careersmanagercandidate/queries';

const UNIMED: SeniorCompany = {
  id: 'fd128524-fc49-4a41-958e-613771d730d4',
  name: 'UNIMED NATAL',
};

const GENTIL: SeniorCompany = {
  id: 'af8cf633-17ff-4452-a734-2cd932fe67f0',
  name: 'Gentil Negócios',
};

function day(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Vaga no formato da listagem. */
function vacancy(overrides: Partial<SeniorVacancy> = {}): SeniorVacancy {
  return {
    id: 'v1',
    title: 'ANALISTA DE SISTEMAS ',
    jobModel: [],
    localization: { city: 'NATAL', province: 'RN', country: 'Brasil' },
    publication: { startDate: '2026-10-16', endDate: day(5) },
    ...overrides,
  };
}

/** Vaga no formato do findVacancyById. */
function details(
  overrides: Partial<SeniorVacancyDetails> = {},
): SeniorVacancyDetails {
  return {
    ...vacancy(),
    pcd: false,
    positions: 1,
    about: {
      description:
        '<div><strong>Atividades</strong></div><ul><li>Manter as integrações em Java com PostgreSQL.</li></ul>',
    },
    requirements: null,
    duties: null,
    ...overrides,
  };
}

function mockSearchOnce(
  contents: { vacancy: SeniorVacancy; company: SeniorCompany }[] | undefined,
  init: { status?: number; totalPages?: number } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(
      contents === undefined
        ? {}
        : {
            totalPages: init.totalPages ?? 1,
            totalElements: contents.length,
            contents,
          },
    ),
  });
}

function mockVacancyOnce(vacancyDetails: SeniorVacancyDetails | null) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: jest
      .fn()
      .mockResolvedValue(
        vacancyDetails ? { vacancy: vacancyDetails, company: UNIMED } : {},
      ),
  });
}

function sentBody(call: number) {
  const [, init] = jest.mocked(global.fetch).mock.calls[call] as [
    string,
    RequestInit,
  ];
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

describe('SeniorSource', () => {
  let service: SeniorSource;

  beforeEach(() => {
    global.fetch = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new SeniorSource(logger as unknown as PinoLogger);
  });

  describe('list', () => {
    it('busca as vagas da Unimed Natal e da Gentil e fica só com as do RN', async () => {
      mockSearchOnce([
        { vacancy: vacancy({ id: 'a' }), company: UNIMED },
        {
          vacancy: vacancy({
            id: 'b',
            localization: {
              city: 'Santa Inês',
              province: 'MA',
              country: 'Brasil',
            },
          }),
          company: GENTIL,
        },
        {
          vacancy: vacancy({
            id: 'c',
            localization: {
              city: 'Mossoró',
              province: 'RN',
              country: 'Brasil',
            },
          }),
          company: GENTIL,
        },
      ]);

      const listed = await service.list();

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/searchVacancies`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(sentBody(0)).toEqual({
        page: 0,
        size: 50,
        filter: '',
        match: { companies: [{ id: UNIMED.id }, { id: GENTIL.id }] },
      });
      expect(listed.map((job) => job.link)).toEqual([
        'https://vagasunimednatal.portaldetalentos.senior.com.br/vacancy/a',
        'https://gentilnegocios.portaldetalentos.senior.com.br/vacancy/c',
      ]);
      expect(listed[0].type).toBe('SENIOR');
    });

    it('ignora a vaga com as inscrições encerradas', async () => {
      mockSearchOnce([
        {
          vacancy: vacancy({
            id: 'a',
            publication: { startDate: '2026-09-01', endDate: day(-1) },
          }),
          company: UNIMED,
        },
        { vacancy: vacancy({ id: 'b' }), company: UNIMED },
      ]);

      const listed = await service.list();

      expect(listed.map((job) => job.senior.id)).toEqual(['b']);
    });

    it('percorre todas as páginas', async () => {
      mockSearchOnce([{ vacancy: vacancy({ id: 'a' }), company: UNIMED }], {
        totalPages: 2,
      });
      mockSearchOnce([{ vacancy: vacancy({ id: 'b' }), company: GENTIL }], {
        totalPages: 2,
      });

      const listed = await service.list();

      expect(sentBody(1)).toMatchObject({ page: 1 });
      expect(listed.map((job) => job.senior.id)).toEqual(['a', 'b']);
    });

    it('falha quando passa do teto de páginas: a lista estaria incompleta', async () => {
      for (let i = 0; i < 5; i++) mockSearchOnce([], { totalPages: 6 });

      await expect(service.list()).rejects.toThrow('mais de 5 páginas');
    });

    it('falha a fonte quando a busca responde erro', async () => {
      mockSearchOnce([], { status: 503 });

      await expect(service.list()).rejects.toThrow('503');
    });

    it('falha a fonte quando a resposta vem sem a lista de vagas', async () => {
      mockSearchOnce(undefined);

      await expect(service.list()).rejects.toThrow('sem a lista de vagas');
    });
  });

  describe('fetchDetails', () => {
    const listed = (overrides: Partial<SeniorVacancy> = {}) => {
      const senior = vacancy(overrides);
      return {
        link: `https://vagasunimednatal.portaldetalentos.senior.com.br/vacancy/${senior.id}`,
        type: 'SENIOR' as const,
        senior,
        company: UNIMED,
      };
    };

    it('monta o payload com a descrição da vaga e o local da Senior', async () => {
      mockVacancyOnce(details({ jobModel: ['HYBRID'], positions: 2 }));

      const [payload] = await service.fetchDetails([listed()]);

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_URL}/findVacancyById`,
        expect.objectContaining({ method: 'POST' }),
      );
      expect(sentBody(0)).toEqual({ id: 'v1' });
      expect(payload).toEqual({
        title: 'ANALISTA DE SISTEMAS',
        type: 'SENIOR',
        link: 'https://vagasunimednatal.portaldetalentos.senior.com.br/vacancy/v1',
        description: [
          'Empresa: UNIMED NATAL',
          'Local: NATAL - RN',
          'Modalidade: Híbrido',
          'Vagas: 2',
          'Atividades',
          'Manter as integrações em Java com PostgreSQL.',
        ].join('\n'),
        isActive: true,
        publishedAt: '2026-10-16',
        subscriptionUntil: `${day(5)}T23:59:59-03:00`,
        attributes: {
          city: 'NATAL',
          state: 'RN',
          formato: 'HIBRIDO',
          isInternational: false,
        },
      });
    });

    it('descarta a vaga sem nenhum termo de tecnologia', async () => {
      mockVacancyOnce(
        details({
          id: 'a',
          title: 'Consultor de Vendas',
          about: { description: '<p>Atendimento ao cliente na loja.</p>' },
        }),
      );
      mockVacancyOnce(details({ id: 'b' }));

      const payloads = await service.fetchDetails([
        listed({ id: 'a' }),
        listed({ id: 'b' }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        listed({ id: 'b' }).link,
      ]);
    });

    it('deixa para a IA o formato quando a vaga não informa um só', async () => {
      mockVacancyOnce(details({ jobModel: [] }));

      const [payload] = await service.fetchDetails([listed()]);

      expect(payload.attributes).not.toHaveProperty('formato');
    });

    it('pula a vaga que falha ao abrir', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      mockVacancyOnce(null);
      mockVacancyOnce(details({ id: 'c' }));

      const payloads = await service.fetchDetails([
        listed({ id: 'a' }),
        listed({ id: 'b' }),
        listed({ id: 'c' }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        listed({ id: 'c' }).link,
      ]);
    });
  });
});
