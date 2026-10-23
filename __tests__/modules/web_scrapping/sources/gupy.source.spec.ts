jest.mock('../../../../generated/prisma/client.js', () =>
  jest.requireActual('../../../../generated/prisma/enums.js'),
);

import { GupySource } from '../../../../src/modules/web_scrapping/sources/gupy.source.js';
import type {
  GupyJob,
  GupyJobPage,
} from '../../../../src/modules/web_scrapping/models/gupy.js';
import type { ActiveJob } from '../../../../src/modules/jobs/services/jobs.service.js';
import type { PinoLogger } from 'nestjs-pino';

/** Vaga no formato que a API do portal devolve. */
function gupyJob(overrides: Partial<GupyJob> = {}): GupyJob {
  const id = overrides.id ?? 1;
  return {
    id,
    name: ' Desenvolvedor Backend Node ',
    applicationDeadline: '2026-11-30T00:00:00.000Z',
    description: 'Vaga para trabalhar com Node.js e PostgreSQL.',
    careerPageName: 'Empresa',
    careerPageLogo: '',
    careerPageUrl: '',
    type: 'vacancy_type_effective',
    publishedDate: '2026-10-16T21:41:53.471Z',
    workplaceType: 'remote',
    city: '',
    state: '',
    jobUrl: `https://empresa.gupy.io/job/${id}`,
    disabilities: true,
    ...overrides,
  };
}

function mockFetchOnce(
  data: GupyJob[] | undefined,
  init: { ok?: boolean; status?: number } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: jest
      .fn()
      .mockResolvedValue(
        data === undefined
          ? {}
          : { data, pagination: { total: 100, limit: 100, offset: 0 } },
      ),
  });
}

/** Página da vaga: Next.js com os dados da vaga no __NEXT_DATA__. */
function mockPageOnce(overrides: Partial<GupyJobPage> = {}) {
  const job: GupyJobPage = {
    id: 1,
    name: 'Desenvolvedor Backend Node',
    status: 'published',
    description: '<p>Somos uma empresa de software.</p>',
    responsibilities: '<p>Manter as APIs da plataforma.</p>',
    prerequisites:
      '<ul><li>Node.js</li><li>NestJS</li><li>PostgreSQL</li></ul>',
    relevantExperiences: '<p>Vale-refeição &amp; plano de saúde</p>',
    addressCity: '',
    addressStateShortName: '',
    addressCountryShortName: '',
    ...overrides,
  };
  const nextData = JSON.stringify({ props: { pageProps: { job } } });

  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: jest
      .fn()
      .mockResolvedValue(
        `<html><body><script id="__NEXT_DATA__" type="application/json">${nextData}</script></body></html>`,
      ),
  });
}

/** Recorte do ActiveJob que o findFinished usa. */
function activeJob(id: number, type: string, subscriptionUntil: Date | null) {
  return { id, type, subscriptionUntil } as unknown as ActiveJob;
}

describe('GupySource', () => {
  let service: GupySource;

  beforeEach(() => {
    global.fetch = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new GupySource(logger as unknown as PinoLogger);
  });

  describe('list', () => {
    it('busca cada termo e não repete a vaga que casa com mais de um', async () => {
      mockFetchOnce([gupyJob({ id: 1 }), gupyJob({ id: 2 })]);
      mockFetchOnce([gupyJob({ id: 2 }), gupyJob({ id: 3 })]);
      for (let i = 0; i < 3; i++) mockFetchOnce([]);
      mockFetchOnce([gupyJob({ id: 3 })]);

      const listed = await service.list();

      // desenvolvedor, developer e software, no país e em Natal.
      expect(global.fetch).toHaveBeenCalledTimes(6);
      const [firstUrl] = jest.mocked(global.fetch).mock.calls[0] as [URL];
      expect(firstUrl.searchParams.get('jobName')).toBe('desenvolvedor');
      expect(firstUrl.searchParams.get('sortBy')).toBe('publishedDate');
      expect(listed.map((job) => job.gupy.id)).toEqual([1, 2, 3]);
      expect(listed[0]).toMatchObject({
        link: 'https://empresa.gupy.io/job/1',
        type: 'GUPY',
      });
    });

    it('busca no país sem local e em Natal com cidade e estado', async () => {
      for (let i = 0; i < 3; i++) mockFetchOnce([gupyJob({ id: 1 })]);
      mockFetchOnce([gupyJob({ id: 1 }), gupyJob({ id: 2 })]);
      for (let i = 0; i < 2; i++) mockFetchOnce([]);

      const listed = await service.list();

      // A vaga que aparece também na busca do país continua de Natal.
      expect(listed.map(({ gupy, natal }) => [gupy.id, natal])).toEqual([
        [1, true],
        [2, true],
      ]);

      const urls = jest
        .mocked(global.fetch)
        .mock.calls.map(([url]) => (url as URL).searchParams);
      expect(urls[0].has('city')).toBe(false);
      expect(urls[0].has('state')).toBe(false);
      expect(urls[3].get('jobName')).toBe('desenvolvedor');
      expect(urls[3].get('city')).toBe('Natal');
      expect(urls[3].get('state')).toBe('Rio Grande do Norte');
    });

    it('ignora as vagas de outros sites que o portal também lista', async () => {
      mockFetchOnce([
        gupyJob({ id: 1 }),
        gupyJob({
          id: 2,
          jobUrl:
            'https://vaga-ja.com/vagas/empresa/produtor?jobBoardSource=gupy_portal',
        }),
      ]);
      for (let i = 0; i < 5; i++) mockFetchOnce([]);

      const listed = await service.list();

      expect(listed.map((job) => job.gupy.id)).toEqual([1]);
    });

    it('falha a fonte quando a API responde erro', async () => {
      mockFetchOnce([], { ok: false, status: 429 });

      await expect(service.list()).rejects.toThrow('429');
    });

    it('falha a fonte quando a resposta vem sem a lista de vagas', async () => {
      mockFetchOnce(undefined);

      await expect(service.list()).rejects.toThrow('sem a lista de vagas');
    });
  });

  describe('fetchDetails', () => {
    const listed = (overrides: Partial<GupyJob> = {}, natal = false) => {
      const gupy = gupyJob(overrides);
      return { link: gupy.jobUrl, type: 'GUPY' as const, gupy, natal };
    };

    it('monta o payload com o texto da página, prazo e atributos da Gupy', async () => {
      mockPageOnce({
        addressCity: 'Natal',
        addressStateShortName: 'RN',
      });

      const [payload] = await service.fetchDetails([
        listed({ workplaceType: 'on-site' }),
      ]);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://empresa.gupy.io/job/1',
      );
      expect(payload).toEqual({
        title: 'Desenvolvedor Backend Node',
        type: 'GUPY',
        link: 'https://empresa.gupy.io/job/1',
        description: [
          'Somos uma empresa de software.',
          'Responsabilidades e atribuições\nManter as APIs da plataforma.',
          'Requisitos e qualificações\nNode.js\nNestJS\nPostgreSQL',
          'Informações adicionais\nVale-refeição & plano de saúde',
        ].join('\n\n'),
        isActive: true,
        publishedAt: '2026-10-16T21:41:53.471Z',
        subscriptionUntil: '2026-11-30T00:00:00.000Z',
        attributes: {
          formato: 'PRESENCIAL',
          modelo: 'CLT',
          city: 'Natal',
          state: 'RN',
        },
      });
    });

    it('descarta a vaga que cita menos de dois termos de tecnologia', async () => {
      mockPageOnce({
        prerequisites: '<ul><li>CNH B</li><li>Técnicas de vendas</li></ul>',
      });
      mockPageOnce({ prerequisites: '<p>Experiência com Python.</p>' });
      mockPageOnce({ prerequisites: '<p>Python e Django.</p>' });

      const payloads = await service.fetchDetails([
        listed({ id: 1, name: 'Desenvolvedor(a) de Mercado' }),
        listed({ id: 2, name: 'Desenvolvedor Backend' }),
        listed({ id: 3, name: 'Desenvolvedor Backend' }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        'https://empresa.gupy.io/job/3',
      ]);
    });

    it('pula a vaga cuja página falha ou já não está publicada', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      mockPageOnce({ status: 'closed' });
      mockPageOnce();

      const payloads = await service.fetchDetails([
        listed({ id: 1 }),
        listed({ id: 2 }),
        listed({ id: 3 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        'https://empresa.gupy.io/job/3',
      ]);
    });

    it('segue com as outras vagas quando o processamento de uma lança erro', async () => {
      // Sem nome e sem termos de tecnologia: quebra ao montar o descarte.
      mockPageOnce({ prerequisites: null });
      mockPageOnce();

      const payloads = await service.fetchDetails([
        listed({ id: 1, name: undefined as unknown as string }),
        listed({ id: 2 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        'https://empresa.gupy.io/job/2',
      ]);
    });

    it('deixa para a IA o que a Gupy não informa', async () => {
      mockPageOnce();

      const [payload] = await service.fetchDetails([
        listed({
          type: 'vacancy_type_talent_pool',
          applicationDeadline: null,
        }),
      ]);

      expect(payload.subscriptionUntil).toBeUndefined();
      expect(payload.attributes).toEqual({ formato: 'REMOTO' });
    });

    it('marca estágio no modelo e na senioridade', async () => {
      mockPageOnce();

      const [payload] = await service.fetchDetails([
        listed({ type: 'vacancy_type_internship' }),
      ]);

      expect(payload.attributes).toMatchObject({
        modelo: 'ESTAGIO',
        senioridade: 'ESTAGIO',
      });
    });

    it('marca como internacional a vaga de fora do Brasil, sem estado', async () => {
      mockPageOnce({
        addressCity: 'Bogota',
        addressStateShortName: 'Ninguno',
        addressCountryShortName: 'CO',
      });

      const [payload] = await service.fetchDetails([
        listed({ workplaceType: 'hybrid' }),
      ]);

      expect(payload.attributes).toEqual({
        formato: 'HIBRIDO',
        modelo: 'CLT',
        city: 'Bogota',
        isInternational: true,
        state: null,
      });
    });

    it('deixa o estado com a IA quando a Gupy não manda uma UF', async () => {
      mockPageOnce({
        addressCity: 'Natal',
        addressStateShortName: 'Rio Grande do Norte',
        addressCountryShortName: 'BR',
      });

      const [payload] = await service.fetchDetails([listed()]);

      expect(payload.attributes).not.toHaveProperty('state');
      expect(payload.attributes).not.toHaveProperty('isInternational');
    });

    it('põe em Natal a vaga achada na busca de Natal, seja qual for o local', async () => {
      mockPageOnce({
        addressCity: 'Bogota',
        addressStateShortName: 'Ninguno',
        addressCountryShortName: 'CO',
      });

      const [payload] = await service.fetchDetails([listed({}, true)]);

      expect(payload.attributes).toMatchObject({
        city: 'Natal',
        state: 'RN',
        isInternational: false,
      });
    });
  });

  describe('findFinished', () => {
    it('encerra só as vagas da Gupy com o prazo de inscrição vencido', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const finished = await service.findFinished([
        activeJob(1, 'GUPY', yesterday),
        activeJob(2, 'GUPY', tomorrow),
        activeJob(3, 'GUPY', null),
        activeJob(4, 'BACKEND_GITHUB', yesterday),
      ]);

      expect(finished).toEqual([{ id: 1 }]);
    });
  });
});
