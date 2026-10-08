jest.mock('../../../../generated/prisma/client.js', () =>
  jest.requireActual('../../../../generated/prisma/enums.js'),
);

jest.mock(
  '../../../../src/modules/web_scrapping/utils/pdf-extractor.service.js',
  () => ({ PdfExtractorService: class PdfExtractorService {} }),
);

import { ImdSource } from '../../../../src/modules/web_scrapping/sources/imd.source.js';
import type { PdfExtractorService } from '../../../../src/modules/web_scrapping/utils/pdf-extractor.service.js';
import type {
  JobUrl,
  JobWithPdfLinks,
} from '../../../../src/modules/web_scrapping/models/sources.js';
import type { ActiveJob } from '../../../../src/modules/jobs/services/jobs.service.js';
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

/** Página de detalhe: tabela cuja 2ª coluna é o rótulo e a 3ª o link. */
function detailPageHtml(rows: { label: string; href: string }[] = []) {
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

function mockFetchOnce(
  html: string,
  init: { ok?: boolean; status?: number } = {},
) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: jest.fn().mockResolvedValue(html),
  });
}

/** Recorte do ActiveJob que o findFinished usa. */
function activeJob({
  id,
  link,
  editalText,
  withEdital = true,
}: {
  id: number;
  link: string;
  editalText?: string;
  withEdital?: boolean;
}) {
  return {
    id,
    title: `Edital ${id}`,
    type: JobType.IMD,
    link,
    edital: withEdital
      ? {
          pdfs:
            editalText === undefined
              ? []
              : [{ type: 'EDITAL', text: editalText }],
        }
      : null,
  } as unknown as ActiveJob;
}

describe('ImdSource', () => {
  let service: ImdSource;
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

    service = new ImdSource(
      logger as unknown as PinoLogger,
      pdfExtractorService as unknown as PdfExtractorService,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('list', () => {
    it('busca a listagem na URL do portal', async () => {
      mockFetchOnce(listPageHtml({}));

      await service.list();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(JOBS_LIST_URL);
    });

    it('extrai link absoluto, título com badge, tipo IMD e data de inscrição', async () => {
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

      const jobs = await service.list();

      expect(jobs).toEqual([
        {
          link: `${SITE_BASE_URL}/portal/visualizar/123`,
          title: 'Seleção de Bolsistas - Ensino',
          type: JobType.IMD,
          subscriptionUntil: new Date('11/05/2026'),
        },
      ]);
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

      const jobs = await service.list();

      expect(jobs[0].title).toBe('Edital Sem Badge');
    });

    it('retorna só os cards da box em andamento', async () => {
      mockFetchOnce(
        listPageHtml({
          andamento:
            jobCard({ href: '/portal/visualizar/1', title: 'Um' }) +
            jobCard({ href: '/portal/visualizar/2', title: 'Dois' }),
          encerrados: jobCard({ href: '/portal/visualizar/9', title: 'Velho' }),
        }),
      );

      const jobs = await service.list();

      expect(jobs.map((j) => j.title)).toEqual(['Um', 'Dois']);
    });

    it('retorna lista vazia e loga warn quando a box não tem editais', async () => {
      mockFetchOnce(listPageHtml({}));

      await expect(service.list()).resolves.toEqual([]);

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

      const jobs = await service.list();

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

      await expect(service.list()).rejects.toThrow(boom);

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

  describe('fetchDetails', () => {
    const job: JobUrl = {
      link: `${SITE_BASE_URL}/portal/visualizar/123`,
      title: 'Seleção de Bolsistas',
      type: JobType.IMD,
      subscriptionUntil: new Date('11/05/2026'),
    };

    /** Editais que o fetchDetails repassou para a extração de PDFs. */
    function extractedJobs(): JobWithPdfLinks[] {
      return pdfExtractorService.extractPdfs.mock.calls[0][0];
    }

    it('busca a página de cada edital', async () => {
      mockFetchOnce(detailPageHtml());
      mockFetchOnce(detailPageHtml());

      await service.fetchDetails([job, { ...job, link: `${job.link}4` }]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(job.link);
      expect(global.fetch).toHaveBeenCalledWith(`${job.link}4`);
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

      await service.fetchDetails([job]);

      expect(extractedJobs()).toEqual([
        {
          ...job,
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
        },
      ]);
    });

    it('marca os editais extraídos como IMD e ativos', async () => {
      mockFetchOnce(detailPageHtml());

      const editais = await service.fetchDetails([job]);

      expect(editais).toEqual([
        expect.objectContaining({
          link: job.link,
          type: 'IMD',
          isActive: true,
        }),
      ]);
    });

    it('loga warn quando a página não tem nenhum link de PDF', async () => {
      mockFetchOnce(detailPageHtml());

      await service.fetchDetails([job]);

      expect(extractedJobs()[0].href).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.pdf_links.empty',
          jobUrl: job.link,
        }),
        expect.any(String),
      );
    });

    it('loga warn mas segue parseando quando o HTTP não é ok', async () => {
      mockFetchOnce(
        detailPageHtml([{ label: 'Edital de Seleção', href: '/portal/d?x=1' }]),
        { ok: false, status: 404 },
      );

      await service.fetchDetails([job]);

      expect(extractedJobs()[0].href).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.job_page.http_not_ok',
          status: 404,
          jobUrl: job.link,
        }),
        expect.any(String),
      );
    });

    it('loga error e propaga quando uma das páginas falha', async () => {
      const boom = new Error('timeout');
      mockFetchOnce(detailPageHtml());
      (global.fetch as jest.Mock).mockRejectedValueOnce(boom);

      await expect(
        service.fetchDetails([job, { ...job, link: `${job.link}4` }]),
      ).rejects.toThrow(boom);

      expect(pdfExtractorService.extractPdfs).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.job_page.failed',
          jobUrl: `${job.link}4`,
          err: boom,
        }),
        expect.any(String),
      );
    });

    it('aceita lista vazia sem chamar a rede', async () => {
      await expect(service.fetchDetails([])).resolves.toEqual([]);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('findFinished', () => {
    const finishedPage = listPageHtml({
      andamento: jobCard({ href: '/portal/visualizar/1', title: 'Aberto' }),
      encerrados: jobCard({ href: '/portal/visualizar/2', title: 'Encerrado' }),
    });

    it('encerra os editais ativos que estão na box de encerrados, com a validade do PDF', async () => {
      mockFetchOnce(finishedPage);

      const toFinish = await service.findFinished([
        activeJob({
          id: 1,
          link: `${SITE_BASE_URL}/portal/visualizar/1`,
          editalText: 'O processo terá validade de 6 meses.',
        }),
        activeJob({
          id: 2,
          link: `${SITE_BASE_URL}/portal/visualizar/2`,
          editalText:
            'Seleção de bolsistas\nO resultado terá validade de 12 (doze) meses, prorrogável.',
        }),
      ]);

      expect(global.fetch).toHaveBeenCalledWith(JOBS_LIST_URL);
      expect(toFinish).toEqual([{ id: 2, validUntil: 12 }]);
    });

    it('ignora vagas sem edital', async () => {
      mockFetchOnce(finishedPage);

      const toFinish = await service.findFinished([
        activeJob({
          id: 2,
          link: `${SITE_BASE_URL}/portal/visualizar/2`,
          withEdital: false,
        }),
      ]);

      expect(toFinish).toEqual([]);
    });

    it('encerra sem validade e loga warn quando não acha a validade no PDF', async () => {
      mockFetchOnce(finishedPage);

      const toFinish = await service.findFinished([
        activeJob({ id: 2, link: `${SITE_BASE_URL}/portal/visualizar/2` }),
      ]);

      expect(toFinish).toEqual([{ id: 2, validUntil: NaN }]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'cron.finish_jobs.valid_until_unparsed',
          jobId: 2,
          hasPdf: false,
        }),
        expect.any(String),
      );
    });

    it('identifica a listagem como encerrados nos logs', async () => {
      mockFetchOnce(listPageHtml({}));

      await service.findFinished([]);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'scraper.list.start',
          listType: 'encerrados',
        }),
        expect.any(String),
      );
    });

    it('propaga a falha da listagem', async () => {
      const boom = new Error('network down');
      (global.fetch as jest.Mock).mockRejectedValueOnce(boom);

      await expect(service.findFinished([])).rejects.toThrow(boom);
    });
  });
});
