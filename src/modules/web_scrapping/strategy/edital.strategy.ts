import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { EditalJobPayload, NewJobStrategy } from './new-job.strategy.js';
import type { CreateVaga } from '../../jobs/dto/jobs.dto.js';
import { resolvePdfTipo } from '../utils/pdf-tipo.util.js';
import type { EditalJobType } from '#src/modules/jobs/job-types.js';

// Fontes cujos editais são sempre de bolsa, qualquer que seja o resumo da IA.
const BOLSA_TYPES: EditalJobType[] = ['IMD', 'LAIS', 'ECT'];

export class EditalStrategy implements NewJobStrategy<EditalJobPayload> {
  constructor(
    private jobsService: JobsService,
    @InjectPinoLogger(EditalStrategy.name)
    private readonly logger: PinoLogger,
  ) {}

  getText(job: EditalJobPayload) {
    return job.pdfs[0].text?.trim() || null;
  }

  async persist(job: EditalJobPayload, vagas: CreateVaga[], publishedAt: Date) {
    const pdfs = job.pdfs.map((pdf) => ({
      ...pdf,
      type: resolvePdfTipo(pdf.label),
    }));
    const vagasCorrect = vagas.map((vaga) => ({
      ...vaga,
      state: vaga.state ?? 'RN',
      city: vaga.city ?? 'Natal',
      modelo: BOLSA_TYPES.includes(job.type) ? 'BOLSISTA' : vaga.modelo,
    }));

    const createdJob = await this.jobsService.createJob({
      title: job.title,
      type: job.type,
      link: job.link,
      isActive: job.isActive,
      subscriptionUntil: job.subscriptionUntil,
      publishedAt,
      description: this.getText(job) ?? '',
      vagas: vagasCorrect,
      pdfs,
    });

    return {
      jobId: createdJob.id,
      logContext: {
        vagaCount: vagas.length,
        pdfCount: pdfs.length,
        pdfTypes: pdfs.map((p) => p.type),
      },
    };
  }
}
