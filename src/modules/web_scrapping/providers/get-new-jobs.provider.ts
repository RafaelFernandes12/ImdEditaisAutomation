import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ImdScraperService } from '../services/imd-scraper.service.js';
import { PdfExtractorService } from '../services/pdf-extractor.service.js';
import { InjectFlowProducer } from '@nestjs/bullmq';
import { FlowProducer } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { JerimunScraperService } from '../services/jerimun-scraper.service.js';
import { StiScraperService } from '../services/sti-scraper.service.js';
import { GithubService } from '../services/github.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class GetNewJobsProvider {
  constructor(
    private imdScraperService: ImdScraperService,
    private readonly githubService: GithubService,
    private pdfExtractorService: PdfExtractorService,
    private readonly jerimunScraperService: JerimunScraperService,
    private readonly stiScraperService: StiScraperService,
    @InjectFlowProducer('notifyAll') private flowProducer: FlowProducer,
    @InjectPinoLogger(GetNewJobsProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron('0 */2 * * *', { timeZone: 'America/Sao_Paulo' })
  async execute() {
    const log = new ScopedLogger(this.logger, 'cron.get_new_jobs', {
      cron: true,
    });

    const timer = log.start('start', 'Iniciando coleta de novos editais');

    try {
      const jerimumJobs = await this.jerimunScraperService.execute();
      const editaisImdJobs = await this.getEditaisImd(log);
      const editaisStiJobs = await this.getEditaisSti(log);
      const githubJobs = await this.getGithubJobs(log);

      const jobs = [
        ...editaisImdJobs,
        ...jerimumJobs,
        ...editaisStiJobs,
        ...githubJobs,
      ];
      await this.flowProducer.add({
        name: 'notifyAll',
        queueName: 'notifyAll',
        children: [
          ...jobs.map((job) => ({
            name: 'getNewJobs',
            queueName: 'getNewJobs',
            data: job,
            opts: { ignoreDependencyOnFailure: true },
          })),
          {
            name: 'finishJobs',
            queueName: 'finishJobs',
            opts: { ignoreDependencyOnFailure: true },
          },
        ],
      });

      timer.info('done', 'Coleta de novos editais finalizada', {
        enqueued: jobs.length,
        enqueuedImd: editaisImdJobs.length,
        enqueuedJerimum: jerimumJobs.length,
        enqueuedSti: editaisStiJobs.length,
        enqueuedGithub: githubJobs.length,
      });
    } catch (err: unknown) {
      timer.error('failed', 'Falha na coleta de novos editais', { err });
      throw err;
    }
  }
  private async getEditaisImd(log: ScopedLogger) {
    try {
      const editaisImdAndamento = await this.pdfExtractorService.execute(
        await this.imdScraperService.getImdEditaisEmAndamento(),
      );
      return editaisImdAndamento.map((r) => ({
        ...r,
        isActive: true,
      }));
    } catch (error: unknown) {
      log.error(
        'imd_failed',
        'Falha na coleta de editais da IMD — seguindo sem eles',
        { err: error },
      );
      return [];
    }
  }
  // Falha na STI não deve impedir a coleta do IMD/Jerimum.
  private async getEditaisSti(log: ScopedLogger) {
    try {
      const editaisSti = await this.pdfExtractorService.extractPdfs(
        await this.stiScraperService.getEditaisEmAndamento(),
      );
      return editaisSti.map((r) => ({ ...r, isActive: true }));
    } catch (error: unknown) {
      log.error(
        'sti_failed',
        'Falha na coleta de editais da STI — seguindo sem eles',
        { err: error },
      );
      return [];
    }
  }
  // Falha no GitHub não deve impedir a coleta das outras fontes.
  private async getGithubJobs(log: ScopedLogger) {
    try {
      return await this.githubService.execute();
    } catch (error: unknown) {
      log.error(
        'github_failed',
        'Falha na coleta de vagas do GitHub — seguindo sem elas',
        { err: error },
      );
      return [];
    }
  }
}
