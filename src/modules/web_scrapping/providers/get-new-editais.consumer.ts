import { Logger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { extractAllKeywords } from '../services/edital-summary-parser.util.js';
import { trimEditalForSummary } from '../services/edital-text-trimmer.util.js';
import { SummarizeEdital } from '../../../modules/ai_chat/services/summarize-edital.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';

interface getNewEditaisResult {
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
    try {
      const edital = job.data as getNewEditaisResult;
      const summary = await this.summarizeEdital.execute(
        trimEditalForSummary(edital.pdfs[0].text),
      );
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
      const pdfCreate = edital.pdfs.map((pdf) => ({
        ...pdf,
        editalId: createdEdital.id,
        type: resolvePdfTipo(pdf.label),
      }));

      await this.pdfService.createMany(pdfCreate);
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
