import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import {
  EditalJobPayload,
  JobSummary,
  NewJobStrategy,
} from './new-job.strategy.js';
import { resolvePdfTipo } from '../utils/pdf-tipo.util.js';

export class EditalStrategy implements NewJobStrategy<EditalJobPayload> {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(EditalStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: EditalJobPayload) {
    return job.pdfs[0].text?.trim() || null;
  }

  async persist(job: EditalJobPayload, resumo: JobSummary) {
    const pdfs = job.pdfs.map((pdf) => ({
      ...pdf,
      type: resolvePdfTipo(pdf.label),
    }));

    const createdJob = await this.jobsService.createJob({
      title: job.title,
      type: job.type,
      link: job.link,
      isActive: job.isActive,
      subscriptionUntil: job.subscriptionUntil,
      description: this.getText(job) ?? '',
      summary: resumo.summary,
      keyWords: resumo.keyWords.join(', '),
      attributes: resumo.attributes,
      pdfs,
    });

    return {
      jobId: createdJob.id,
      logContext: {
        pdfCount: pdfs.length,
        pdfTypes: pdfs.map((p) => p.type),
      },
    };
  }
}
