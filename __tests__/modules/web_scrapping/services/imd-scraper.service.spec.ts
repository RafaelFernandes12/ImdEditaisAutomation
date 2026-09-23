jest.mock('../../../../generated/prisma/client.js', () =>
  jest.requireActual('../../../../generated/prisma/enums.js'),
);

jest.mock('../../../../src/modules/pdf/services/pdf.service.js', () => ({
  PdfService: class PdfService {},
}));

import { ImdScraperService } from '../../../../src/modules/web_scrapping/services/imd-scraper.service.js';
import type { PdfService } from '../../../../src/modules/pdf/services/pdf.service.js';
import type { PinoLogger } from 'nestjs-pino';
import { JobType } from '../../../../generated/prisma/client.js';

const SITE_BASE_URL = 'https://www.metropoledigital.ufrn.br';
const JOBS_LIST_URL = `${SITE_BASE_URL}/portal/editais`;

/** Monta um card de edital igual ao do site: <a> com <h5>, <span class="badge"> e <p>. */
function jobCard({
  href,
  title,
  badge = '',
  until = '01/10/2026',
}: {
  href: string;
  title: string;
  badge?: string;
  until?: string;
}) {
  return `
    <a href="${href}">
      <h5>${title}</h5>
      ${badge ? `<span class="badge">${badge}</span>` : ''}
      <p>Inscrições até ${until}</p>
    </a>`;
}

function listPageHtml({
  andamento = '',
  encerrados = '',
}: {
  andamento?: string;
  encerrados?: string;
}) {
  return `
    <html><body>
      <div class="box-editais-andamentos">${andamento}</div>
      <div class="box-editais-encerrados">${encerrados}</div>
    </body></html>`;
}

function mockFetchOnce(
  html: string,
  init: { ok?: boolean; status?: number } = {},
) {
  const response = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: jest.fn().mockResolvedValue(html),
  };
  (global.fetch as jest.Mock).mockResolvedValueOnce(response);
  return response;
}

describe('ImdScraperService', () => {
  let service: ImdScraperService;
  let pdfService: jest.Mocked<Pick<PdfService, 'findByLink'>>;
  let logger: jest.Mocked<
    Pick<PinoLogger, 'info' | 'warn' | 'debug' | 'error'>
  >;

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch;

    pdfService = { findByLink: jest.fn() };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };

    service = new ImdScraperService(
      pdfService as unknown as PdfService,
      logger as unknown as PinoLogger,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getImdEditaisEmAndamento', () => {
    it('busca a listagem na URL do portal', async () => {
      mockFetchOnce(listPageHtml({}));

      await service.getImdEditaisEmAndamento();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(JOBS_LIST_URL);
    });

    it('extrai href absoluto, título com badge, tipo IMD e data de inscrição', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento: jobCard({
            href: '/portal/visualizar/123',
            title: 'Seleção de Bolsistas',
            badge: 'Ensino',
            until: '05/11/2026',
          }),
        }),
      );

      const jobs = await service.getImdEditaisEmAndamento();

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        href: `${SITE_BASE_URL}/portal/visualizar/123`,
        title: 'Seleção de Bolsistas - Ensino',
        type: JobType.IMD,
        subscriptionUntil: new Date('11/05/2026'),
      });
    });

    it('não adiciona o separador quando o card não tem badge', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento: jobCard({
            href: '/portal/visualizar/1',
            title: 'Edital Sem Badge',
          }),
        }),
      );

      const [job] = await service.getImdEditaisEmAndamento();

      expect(job.title).toBe('Edital Sem Badge');
    });

    it('retorna todos os cards da box em andamento', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento:
            jobCard({ href: '/portal/visualizar/1', title: 'Um' }) +
            jobCard({ href: '/portal/visualizar/2', title: 'Dois' }),
          encerrados: jobCard({ href: '/portal/visualizar/9', title: 'Velho' }),
        }),
      );

      const jobs = await service.getImdEditaisEmAndamento();

      expect(jobs.map((j) => j.title)).toEqual(['Um', 'Dois']);
    });

    it('retorna lista vazia e loga warn quando a box não tem editais', async () => {
      mockFetchOnce(listPageHtml({}));

      const jobs = await service.getImdEditaisEmAndamento();

      expect(jobs).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.list.empty',
          listType: 'em_andamento',
          boxName: '.box-editais-andamentos',
        }),
        expect.any(String),
      );
    });

    it('loga warn mas segue parseando quando o HTTP não é ok', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento: jobCard({ href: '/portal/visualizar/1', title: 'Um' }),
        }),
        { ok: false, status: 500 },
      );

      const jobs = await service.getImdEditaisEmAndamento();

      expect(jobs).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.list.http_not_ok',
          status: 500,
        }),
        expect.any(String),
      );
    });

    it('loga error e propaga quando o fetch falha', async () => {
      const boom = new Error('network down');
      (global.fetch as jest.Mock).mockRejectedValueOnce(boom);

      await expect(service.getImdEditaisEmAndamento()).rejects.toThrow(boom);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.list.failed',
          listType: 'em_andamento',
          err: boom,
        }),
        expect.any(String),
      );
    });
  });

  describe('getJobsPdfs', () => {
    const job = {
      href: `${SITE_BASE_URL}/portal/visualizar/123`,
      title: 'Seleção de Bolsistas',
      type: JobType.IMD,
      subscriptionUntil: new Date('11/05/2026'),
    };

    /** Página de detalhe: tabela cuja 2ª coluna é o rótulo e a 3ª o link. */
    function detailPageHtml(rows: { label: string; href: string }[]) {
      const trs = rows
        .map(
          (r) => `
            <tr>
              <td>1</td>
              <td>${r.label}</td>
              <td><a href="${r.href}">baixar</a></td>
            </tr>`,
        )
        .join('');
      return `<html><body><table class="tb_noticias">${trs}</table></body></html>`;
    }

    it('busca a página de cada edital', async () => {
      mockFetchOnce(detailPageHtml([]));
      mockFetchOnce(detailPageHtml([]));

      await service.getJobsPdfs([job, { ...job, href: `${job.href}4` }]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(job.href);
      expect(global.fetch).toHaveBeenCalledWith(`${job.href}4`);
    });

    it('extrai rótulo e link absoluto de cada PDF, preservando os dados do edital', async () => {
      mockFetchOnce(
        detailPageHtml([
          {
            label: 'Edital de Seleção',
            href: '/portal/download?nome=abc&id=1',
          },
          { label: 'Resultado Final', href: '/portal/download?nome=def&id=1' },
        ]),
      );

      const [result] = await service.getJobsPdfs([job]);

      expect(result).toEqual({
        title: job.title,
        type: job.type,
        subscriptionUntil: job.subscriptionUntil,
        link: job.href,
        href: [
          {
            label: 'Edital de Seleção',
            link: `${SITE_BASE_URL}/portal/download?nome=abc&id=1`,
          },
          {
            label: 'Resultado Final',
            link: `${SITE_BASE_URL}/portal/download?nome=def&id=1`,
          },
        ],
      });
    });

    it('loga warn quando a página não tem nenhum link de PDF', async () => {
      mockFetchOnce(detailPageHtml([]));

      const [result] = await service.getJobsPdfs([job]);

      expect(result.href).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.pdf_links.empty',
          jobUrl: job.href,
        }),
        expect.any(String),
      );
    });

    it('loga warn mas segue parseando quando o HTTP não é ok', async () => {
      mockFetchOnce(
        detailPageHtml([{ label: 'Edital de Seleção', href: '/portal/d?x=1' }]),
        { ok: false, status: 404 },
      );

      const [result] = await service.getJobsPdfs([job]);

      expect(result.href).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.job_page.http_not_ok',
          status: 404,
          jobUrl: job.href,
        }),
        expect.any(String),
      );
    });

    it('loga error e propaga quando uma das páginas falha', async () => {
      const boom = new Error('timeout');
      mockFetchOnce(detailPageHtml([]));
      (global.fetch as jest.Mock).mockRejectedValueOnce(boom);

      await expect(
        service.getJobsPdfs([job, { ...job, href: `${job.href}4` }]),
      ).rejects.toThrow(boom);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.job_page.failed',
          jobUrl: `${job.href}4`,
          err: boom,
        }),
        expect.any(String),
      );
    });

    it('aceita lista vazia sem chamar a rede', async () => {
      await expect(service.getJobsPdfs([])).resolves.toEqual([]);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.pdf_links.batch_done',
          count: 0,
          totalPdfLinks: 0,
        }),
        expect.any(String),
      );
    });

    // Comportamento ATUAL (provável bug): o `downloadHref.filter(...)` que
    // consulta o PdfService tem o resultado descartado, então PDFs já salvos
    // continuam aparecendo no retorno.
    it('não remove PDFs já existentes no banco (resultado do filter é descartado)', async () => {
      pdfService.findByLink.mockResolvedValue({ id: 1 } as never);
      mockFetchOnce(
        detailPageHtml([{ label: 'Edital de Seleção', href: '/portal/d?x=1' }]),
      );

      const [result] = await service.getJobsPdfs([job]);

      expect(result.href).toHaveLength(1);
    });
  });

  describe('getImdEditaisFinished', () => {
    it('lê apenas a box de encerrados', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento: jobCard({ href: '/portal/visualizar/1', title: 'Aberto' }),
          encerrados: jobCard({
            href: '/portal/visualizar/2',
            title: 'Encerrado',
          }),
        }),
      );

      const jobs = await service.getImdEditaisFinished();

      expect(jobs.map((j) => j.title)).toEqual(['Encerrado']);
    });

    it('identifica a listagem como encerrados nos logs', async () => {
      mockFetchOnce(listPageHtml({}));

      await service.getImdEditaisFinished();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.list.start',
          listType: 'encerrados',
        }),
        expect.any(String),
      );
    });
  });
});
