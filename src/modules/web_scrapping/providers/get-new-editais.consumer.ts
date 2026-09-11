import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
  subscriptionUntil: Date;
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
    @InjectPinoLogger(GetNewEditaisConsumer.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job) {
    const startedAt = Date.now();
    const edital = job.data as getNewEditaisResult;

    this.logger.info(
      {
        evt: 'queue.get_new_editais.job_start',
        queue: 'getNewEditais',
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        editalTitle: edital.title,
        pdfCount: edital.pdfs.length,
      },
      'Processando novo edital',
    );

    try {
      if (edital.pdfs.length === 0) {
        this.logger.warn(
          {
            evt: 'queue.get_new_editais.no_pdfs',
            queue: 'getNewEditais',
            jobId: job.id,
            editalTitle: edital.title,
          },
          'Edital chegou na fila sem nenhum PDF',
        );
        return;
      }

      const trimmed = trimEditalForSummary(edital.pdfs[0].text);

      this.logger.debug(
        {
          evt: 'queue.get_new_editais.trimmed',
          queue: 'getNewEditais',
          jobId: job.id,
          editalTitle: edital.title,
          rawLength: edital.pdfs[0].text.length,
          trimmedLength: trimmed.length,
        },
        'Texto do edital preparado para o resumo',
      );

      const summarizeStartedAt = Date.now();
      const summary = await this.summarizeEdital.execute(trimmed);
      const keyWords = extractAllKeywords(summary).join(', ');

      this.logger.info(
        {
          evt: 'queue.get_new_editais.summarized',
          queue: 'getNewEditais',
          jobId: job.id,
          editalTitle: edital.title,
          summaryLength: summary.length,
          keywordCount: keyWords ? keyWords.split(', ').length : 0,
          durationMs: Date.now() - summarizeStartedAt,
        },
        'Edital resumido pela LLM',
      );

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

      this.logger.info(
        {
          evt: 'queue.get_new_editais.job_done',
          queue: 'getNewEditais',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          editalId: createdEdital.id,
          editalTitle: edital.title,
          pdfCount: pdfCreate.length,
          pdfTypes: pdfCreate.map((p) => p.type),
          durationMs: Date.now() - startedAt,
        },
        'Edital gravado com seus PDFs',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.get_new_editais.job_failed',
          queue: 'getNewEditais',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          editalTitle: edital.title,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao processar novo edital',
      );
      throw new BadRequestException(e);
    }
  }
}
