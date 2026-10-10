jest.mock('../../../../src/modules/pdf/services/pdf.service.js', () => ({
  PdfService: class PdfService {},
}));

jest.mock('pdf-parse', () => ({
  PDFParse: class PDFParse {
    getText() {
      return Promise.resolve({ text: 'texto do pdf' });
    }
  },
}));

import { PdfExtractorService } from '../../../../src/modules/web_scrapping/utils/pdf-extractor.service.js';
import type { PdfService } from '../../../../src/modules/pdf/services/pdf.service.js';
import type { JobWithPdfLinks } from '../../../../src/modules/web_scrapping/models/sources.js';
import type { PinoLogger } from 'nestjs-pino';
import { JobType } from '../../../../generated/prisma/enums.js';

function edital(link: string, pdfLinks: string[]): JobWithPdfLinks {
  return {
    link,
    title: `Edital ${link}`,
    type: JobType.IMD,
    subscriptionUntil: new Date('2026-11-05'),
    href: pdfLinks.map((pdfLink) => ({ label: 'Edital', link: pdfLink })),
  };
}

describe('PdfExtractorService', () => {
  let service: PdfExtractorService;
  let pdfService: jest.Mocked<Pick<PdfService, 'findByLink'>>;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    pdfService = { findByLink: jest.fn().mockResolvedValue(null) };
    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
    service = new PdfExtractorService(
      pdfService as unknown as PdfService,
      logger as unknown as PinoLogger,
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('extrai só os PDFs que ainda não estão no banco', async () => {
    pdfService.findByLink.mockImplementation((link) =>
      Promise.resolve(link === 'pdf-velho' ? ({ id: 1 } as never) : null),
    );

    const result = await service.extractPdfs([
      edital('a', ['pdf-velho', 'pdf-novo']),
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({
        link: 'a',
        pdfs: [{ label: 'Edital', link: 'pdf-novo', text: 'texto do pdf' }],
      }),
    ]);
  });

  it('descarta o edital que não tem nenhum PDF novo', async () => {
    pdfService.findByLink.mockImplementation((link) =>
      Promise.resolve(link === 'pdf-velho' ? ({ id: 1 } as never) : null),
    );

    const result = await service.extractPdfs([
      edital('ja-gravado', ['pdf-velho']),
      edital('sem-pdf', []),
      edital('novo', ['pdf-novo']),
    ]);

    expect(result.map((r) => r.link)).toEqual(['novo']);
  });
});
