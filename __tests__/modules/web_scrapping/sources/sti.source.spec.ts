jest.mock('../../../../generated/prisma/client.js', () =>
  jest.requireActual('../../../../generated/prisma/enums.js'),
);

jest.mock(
  '../../../../src/modules/web_scrapping/utils/pdf-extractor.service.js',
  () => ({ PdfExtractorService: class PdfExtractorService {} }),
);

import { StiSource } from '../../../../src/modules/web_scrapping/sources/sti.source.js';
import type { PinoLogger } from 'nestjs-pino';
import type { PdfExtractorService } from '../../../../src/modules/web_scrapping/utils/pdf-extractor.service.js';
import type { JobWithPdfLinks } from '../../../../src/modules/web_scrapping/models/sources.js';
import { JobType } from '../../../../generated/prisma/client.js';

const API_URL =
  'https://webcache02-producao.info.ufrn.br/admin/sinfo/wp-json/wp/v2/editais-em-andamento';

/** Recorte do JSON real retornado pela API do WordPress da STI. */
function stiEdital(overrides: Record<string, unknown> = {}) {
  return {
    id: 4337,
    title: {
      rendered:
        'Processo Seletivo para Bolsista Pesquisador &#8211; Especialista Convidado | Edital 15/2026 &#8211; STI/UFRN',
    },
    acf: {
      data_de_abertura: '2026-09-15',
      fim_das_inscricoes: '2026-09-27',
      arquivos: [
        {
          title: { rendered: 'Edital 15/2026 &#8211; STI/UFRN' },
          acf: {
            anexo:
              'https://wp-sites.info.ufrn.br/admin/sinfo/wp-content/uploads/sites/2/2026/09/1_Edital-15.2026_assinado.pdf',
          },
        },
        {
          title: { rendered: 'RETIFICAÇÃO 01 | Edital 15/2026 – STI/UFRN' },
          acf: {
            anexo:
              'https://wp-sites.info.ufrn.br/admin/sinfo/wp-content/uploads/sites/2/2026/09/02_Edital_RETIFICAÃ_Ã_O.pdf',
          },
        },
        { title: { rendered: 'Link sem anexo' }, acf: { anexo: '' } },
      ],
    },
    ...overrides,
  };
}

function mockFetchOnce(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: jest.fn().mockResolvedValue(body),
  });
}

const PUBLIC_EDITAL_URL =
  'https://sti.ufrn.br/oportunidades/processos-seletivos-edital';

describe('StiSource', () => {
  let service: StiSource;
  let pdfExtractorService: jest.Mocked<
    Pick<PdfExtractorService, 'extractPdfs'>
  >;
  let logger: jest.Mocked<
    Pick<PinoLogger, 'info' | 'warn' | 'debug' | 'error'>
  >;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    pdfExtractorService = {
      extractPdfs: jest.fn().mockImplementation((jobs: JobWithPdfLinks[]) =>
        Promise.resolve(
          jobs.map((job) => ({
            title: job.title,
            type: job.type,
            link: job.link,
            subscriptionUntil: job.subscriptionUntil,
            pdfs: [],
          })),
        ),
      ),
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new StiSource(
      logger as unknown as PinoLogger,
      pdfExtractorService as unknown as PdfExtractorService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('list', () => {
    it('mapeia editais da API para JobWithPdfLinks', async () => {
      mockFetchOnce([stiEdital()]);

      const jobs = await service.list();

      expect(global.fetch).toHaveBeenCalledWith(API_URL);
      expect(jobs).toEqual([
        {
          title:
            'Processo Seletivo para Bolsista Pesquisador – Especialista Convidado | Edital 15/2026 – STI/UFRN',
          type: JobType.STI,
          link: `${PUBLIC_EDITAL_URL}/4337`,
          subscriptionUntil: new Date('2026-09-28T02:59:59.000Z'),
          href: [
            {
              label: 'Edital 15/2026 – STI/UFRN',
              link: 'https://wp-sites.info.ufrn.br/admin/sinfo/wp-content/uploads/sites/2/2026/09/1_Edital-15.2026_assinado.pdf',
            },
            {
              label: 'RETIFICAÇÃO 01 | Edital 15/2026 – STI/UFRN',
              link: 'https://wp-sites.info.ufrn.br/admin/sinfo/wp-content/uploads/sites/2/2026/09/02_Edital_RETIFICA%C3%83_%C3%83_O.pdf',
            },
          ],
        },
      ]);
    });

    it('trata edital sem arquivos (ACF retorna false)', async () => {
      mockFetchOnce([
        stiEdital({
          acf: { fim_das_inscricoes: '2026-09-27', arquivos: false },
        }),
      ]);

      const jobs = await service.list();

      expect(jobs[0].href).toEqual([]);
    });

    it('avisa quando a listagem vem vazia', async () => {
      mockFetchOnce([]);

      await expect(service.list()).resolves.toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ evt: 'scraper.sti.list.empty' }),
        expect.any(String),
      );
    });

    it('loga e relança quando o fetch falha', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));

      await expect(service.list()).rejects.toThrow('offline');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ evt: 'scraper.sti.list.failed' }),
        expect.any(String),
      );
    });
  });

  describe('fetchDetails', () => {
    it('extrai os PDFs e marca os editais como STI e ativos', async () => {
      mockFetchOnce([stiEdital()]);
      const jobs = await service.list();

      const editais = await service.fetchDetails(jobs);

      expect(pdfExtractorService.extractPdfs).toHaveBeenCalledWith(jobs);
      expect(editais).toEqual([
        expect.objectContaining({
          link: `${PUBLIC_EDITAL_URL}/4337`,
          type: 'STI',
          isActive: true,
        }),
      ]);
    });

    it('propaga a falha da extração de PDFs', async () => {
      pdfExtractorService.extractPdfs.mockRejectedValueOnce(
        new Error('pdf quebrado'),
      );

      await expect(service.fetchDetails([])).rejects.toThrow('pdf quebrado');
    });
  });
});
