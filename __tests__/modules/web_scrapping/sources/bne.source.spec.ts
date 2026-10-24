jest.mock('node:timers/promises', () => ({
  setTimeout: jest.fn().mockResolvedValue(undefined),
}));

import { BneSource } from '../../../../src/modules/web_scrapping/sources/bne.source.js';
import type { BneJob } from '../../../../src/modules/web_scrapping/models/bne.js';
import type { PinoLogger } from 'nestjs-pino';

/** Vaga no formato do JSON que a listagem embute. */
function bneJob(overrides: Partial<BneJob> = {}): BneJob {
  const id = overrides.Id ?? 1;
  return {
    Id: id,
    Status: 0,
    Function: { Name: 'desenvolvedor' },
    City: { Name: 'Natal' },
    StateAbbreviation: 'RN',
    Area: 'Informática',
    CompanyName: 'Empresa',
    MinSalary: 0,
    MaxSalary: 0,
    PostDate: '2026-10-22T10:00:00.000Z',
    LinkType: [],
    Home_Office: false,
    Url: `https://www.bne.com.br/vaga-de-emprego-na-area-informatica-em-natal-rn/desenvolvedor/${id}`,
    ...overrides,
  };
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Página da busca: as vagas vêm no value do input #jobInfoLocal. */
function mockListOnce(jobs: BneJob[] | null, init: { status?: number } = {}) {
  const input =
    jobs === null
      ? ''
      : `<input type="hidden" id="jobInfoLocal" value="${escapeAttr(JSON.stringify(jobs))}" />`;
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    text: jest.fn().mockResolvedValue(`<html><body>${input}</body></html>`),
  });
}

/** Página da vaga: descrição no JSON-LD e os campos no topo. */
function mockPageOnce(
  overrides: {
    description?: string | null;
    modality?: string;
    contract?: string;
  } = {},
) {
  const description =
    overrides.description === undefined
      ? '<p>Desenvolver APIs em Node.js com PostgreSQL. Requisitos: TypeScript.</p>'
      : overrides.description;
  const jsonLd =
    description === null
      ? ''
      : `<script type="application/ld+json">${JSON.stringify({
          '@type': 'JobPosting',
          description,
        })}</script>`;
  const item = (label: string, value: string) =>
    `<div class="job__open__infos-item"><span class="icon"></span><strong>${label}: </strong><span>${value}</span></div>`;

  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: jest
      .fn()
      .mockResolvedValue(
        `<html><head>${jsonLd}</head><body>${[
          item('Cargo', 'desenvolvedor'),
          item('Salário', ' a combinar'),
          item('Modalidade', overrides.modality ?? 'Presencial'),
          item('Contrato', overrides.contract ?? 'Efetivo'),
        ].join('')}</body></html>`,
      ),
  });
}

describe('BneSource', () => {
  let service: BneSource;

  beforeEach(() => {
    global.fetch = jest.fn();
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new BneSource(logger as unknown as PinoLogger);
  });

  describe('list', () => {
    it('busca a área de Informática em Natal e para nas vagas encerradas', async () => {
      mockListOnce([
        bneJob({ Id: 1 }),
        bneJob({ Id: 2 }),
        bneJob({ Id: 3, Status: 2 }),
      ]);

      const listed = await service.list();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url] = jest.mocked(global.fetch).mock.calls[0] as [URL];
      expect(url.pathname).toBe('/vagas-de-emprego-na-area-de-informatica');
      expect(url.searchParams.get('Area')).toBe('Informatica');
      expect(url.searchParams.get('CityName')).toBe('natal-rn');
      expect(listed.map((job) => job.bne.Id)).toEqual([1, 2]);
      expect(listed[0]).toMatchObject({
        link: 'https://www.bne.com.br/vaga-de-emprego-na-area-informatica-em-natal-rn/desenvolvedor/1',
        type: 'BNE',
      });
    });

    it('segue para a próxima página enquanto só vê vagas ativas', async () => {
      mockListOnce([bneJob({ Id: 1 })]);
      mockListOnce([bneJob({ Id: 2 }), bneJob({ Id: 3, Status: 2 })]);

      const listed = await service.list();

      const [, [secondUrl]] = jest.mocked(global.fetch).mock.calls as [URL][];
      expect(secondUrl.searchParams.get('Page')).toBe('2');
      expect(listed.map((job) => job.bne.Id)).toEqual([1, 2]);
    });

    it('para quando a página vem vazia', async () => {
      mockListOnce([bneJob({ Id: 1 })]);
      mockListOnce([]);

      const listed = await service.list();

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(listed.map((job) => job.bne.Id)).toEqual([1]);
    });

    it('ignora as vagas parecidas de outros lugares ou áreas', async () => {
      mockListOnce([
        bneJob({ Id: 1, City: { Name: 'Indaiatuba' } }),
        bneJob({ Id: 2, Area: 'Comércio' }),
        bneJob({ Id: 3 }),
        bneJob({ Id: 4, Status: 2 }),
      ]);

      const listed = await service.list();

      expect(listed.map((job) => job.bne.Id)).toEqual([3]);
    });

    it('falha quando não chega nas encerradas: a lista estaria incompleta', async () => {
      for (let i = 1; i <= 5; i++) mockListOnce([bneJob({ Id: i })]);

      await expect(service.list()).rejects.toThrow('mais de 5 páginas');
    });

    it('falha a fonte quando a busca responde erro', async () => {
      mockListOnce([], { status: 503 });

      await expect(service.list()).rejects.toThrow('503');
    });

    it('falha a fonte quando a página vem sem o JSON das vagas', async () => {
      mockListOnce(null);

      await expect(service.list()).rejects.toThrow('sem o JSON das vagas');
    });
  });

  describe('fetchDetails', () => {
    const listed = (overrides: Partial<BneJob> = {}) => {
      const bne = bneJob(overrides);
      return { link: bne.Url, type: 'BNE' as const, bne };
    };

    it('monta o payload com a descrição da página e os atributos do BNE', async () => {
      mockPageOnce();

      const [payload] = await service.fetchDetails([
        listed({ MinSalary: 3000, MaxSalary: 4000 }),
      ]);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.bne.com.br/vaga-de-emprego-na-area-informatica-em-natal-rn/desenvolvedor/1',
        expect.anything(),
      );
      expect(payload).toEqual({
        title: 'Desenvolvedor',
        type: 'BNE',
        link: 'https://www.bne.com.br/vaga-de-emprego-na-area-informatica-em-natal-rn/desenvolvedor/1',
        description: [
          'Empresa: Empresa',
          'Local: Natal - RN',
          'Modalidade: Presencial',
          'Contrato: Efetivo',
          'Salário: R$ 3000 a R$ 4000',
          'Desenvolver APIs em Node.js com PostgreSQL. Requisitos: TypeScript.',
        ].join('\n'),
        isActive: true,
        publishedAt: '2026-10-22T10:00:00.000Z',
        attributes: {
          formato: 'PRESENCIAL',
          modelo: 'CLT',
          salary: 3000,
          city: 'Natal',
          state: 'RN',
          isInternational: false,
        },
      });
    });

    it('descarta a vaga de TI que não é de desenvolvimento', async () => {
      mockPageOnce({
        description: '<p>Suporte ao usuário e manutenção de impressoras.</p>',
      });
      mockPageOnce();

      const payloads = await service.fetchDetails([
        listed({ Id: 1, Function: { Name: 'técnico de suporte' } }),
        listed({ Id: 2 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        listed({ Id: 2 }).link,
      ]);
    });

    it('marca estágio no modelo e na senioridade e home office como remoto', async () => {
      mockPageOnce({ contract: 'Estágio', modality: 'Home Office' });

      const [payload] = await service.fetchDetails([
        listed({ Home_Office: true }),
      ]);

      expect(payload.attributes).toMatchObject({
        formato: 'REMOTO',
        modelo: 'ESTAGIO',
        senioridade: 'ESTAGIO',
      });
    });

    it('deixa para a IA o contrato que não tem modelo', async () => {
      mockPageOnce({ contract: 'Temporário' });

      const [payload] = await service.fetchDetails([listed()]);

      expect(payload.attributes).not.toHaveProperty('modelo');
      expect(payload.attributes).not.toHaveProperty('senioridade');
      expect(payload.attributes).not.toHaveProperty('salary');
    });

    it('pula a vaga cuja página falha ou vem sem o JSON-LD', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });
      mockPageOnce({ description: null });
      mockPageOnce();

      const payloads = await service.fetchDetails([
        listed({ Id: 1 }),
        listed({ Id: 2 }),
        listed({ Id: 3 }),
      ]);

      expect(payloads.map((payload) => payload.link)).toEqual([
        listed({ Id: 3 }).link,
      ]);
    });
  });
});
