import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { EditalJobPayload, NewJobStrategy } from './new-job.strategy.js';
import { SummarizeJobEditalImd } from '#src/modules/ai_chat/services/summarize-job-edital-imd.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { PdfService } from '#src/modules/pdf/services/pdf.service.js';

export class EditalStrategy implements NewJobStrategy<EditalJobPayload> {
  constructor(
    private jobsService: JobsService,
    private readonly summarizeJobEditalImd: SummarizeJobEditalImd,
    private readonly pdfService: PdfService,
    @InjectPinoLogger(EditalStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: EditalJobPayload) {
    return job.pdfs[0].text?.trim() || null;
  }

  async summarize(text: string) {
    return await this.summarizeJobEditalImd.execute(text);
  }

  async persist(job: EditalJobPayload, summary: string, keyWords: string) {
    const createdJob = await this.jobsService.createJob({
      title: job.title,
      type: job.type,
      link: job.link,
      isActive: job.isActive,
      edital: { subscriptionUntil: job.subscriptionUntil },
      keyWords,
      summary,
    });

    const pdfCreate = job.pdfs.map((pdf) => ({
      ...pdf,
      editalId: createdJob.id,
      type: resolvePdfTipo(pdf.label),
    }));

    await this.pdfService.createMany(pdfCreate);

    return {
      jobId: createdJob.id,
      logContext: {
        pdfCount: pdfCreate.length,
        pdfTypes: pdfCreate.map((p) => p.type),
      },
    };
  }
}
