import { Logger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { extractAllKeywords } from '../services/edital-summary-parser.util.js';
import { SummarizeEdital } from '../../../modules/ai_chat/services/summarize-edital.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

interface getNewEditaisResult {
  pdf: {
    text: string;
    label: string;
    link: string;
  };
  isActive: boolean;
  badge: string;
  title: string;
  link: string;
  subscriptionUntil: string;
  pdfs: {
    text: string;
    label: string;
    link: string;
  }[];
}

@Processor('getNewEditais')
export class GetNewEditaisConsumer extends WorkerHost {
  constructor(
    private editalService: EditalService,
    private pdfService: PdfService,
    private summarizeEdital: SummarizeEdital,
    private readonly logger: Logger,
  ) {
    super();
  }
  async process(job: Job) {
    const edital = job.data as getNewEditaisResult;
    const summary = await this.summarizeEdital.execute(edital.pdf.text);
    const keyWords = extractAllKeywords(summary).join(', ');
    const createdEdital = await this.editalService.createEdital({
      badge: edital.badge,
      title: edital.title,
      link: edital.link,
      isActive: edital.isActive,
      subscriptionUntil: edital.subscriptionUntil,
      keyWords,
      summary,
    });
    const pdfBody = {
      ...edital.pdf,
      editalId: createdEdital.id,
      type: resolvePdfTipo(edital.pdf.label),
    };

    await this.pdfService.create(pdfBody);
  }
}
