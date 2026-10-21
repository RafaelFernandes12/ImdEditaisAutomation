import { Inject, Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { UserService } from '../../user/services/user.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatRankedVagas } from '../../../utils/format-job-lines.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { rankVagas } from '../../web_scrapping/utils/job-filter.util.js';
import {
  JOB_WEIGHTS,
  type JobWeights,
} from '../../web_scrapping/sources/job.source.js';

@Injectable()
export class GetJobs {
  constructor(
    private jobsService: JobsService,
    private userService: UserService,
    @InjectPinoLogger(GetJobs.name)
    private readonly logger: PinoLogger,
    @Inject(JOB_WEIGHTS)
    private readonly weights: JobWeights,
  ) {}

  async execute(message: pkg.Message, stillActive: boolean) {
    const log = new ScopedLogger(this.logger, 'wa.jobs_andamento', {
      chatId: maskContact(message.from),
    }).timed();
    const [activeJobs, user] = await Promise.all([
      this.jobsService.findActive(stillActive),
      this.userService.findByChatId(message.from),
    ]);

    // Mesmo ranking da notificação: as fontes locais vão sempre e as do
    // GitHub passam pelas preferências do usuário.
    const ranked = rankVagas(
      { UserPreferences: user?.UserPreferences ?? null },
      activeJobs,
      this.weights,
    );

    if (ranked.length === 0) {
      log.warn('empty', 'Nenhuma vaga para responder', {
        activeCount: activeJobs.length,
      });
      await message.reply('Nenhuma vaga em andamento no momento.');
      return;
    }

    const header = stillActive ? 'VAGAS EM ANDAMENTO' : 'VAGAS ABERTAS';
    const body = formatRankedVagas(ranked);
    await message.reply(`${header}:\n\n${body}`);

    log.info('done', 'Vagas enviadas', {
      jobCount: activeJobs.length,
      vagaCount: ranked.length,
      length: body.length,
    });
  }
}
