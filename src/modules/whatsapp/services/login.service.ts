import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { GetJobs } from './getJobs.js';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { maskContact } from '../../../utils/log-redact.js';
import { getFormattedContact } from './util.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { ECOSYSTEMS } from '#src/modules/web_scrapping/models/ecossystems.js';

type loginData = {
  name?: string;
  keywords?: string;
};

@Injectable()
export class LoginService {
  constructor(
    private jobsService: JobsService,
    private userService: UserService,
    private getJobsAndamento: GetJobs,
    @InjectPinoLogger(LoginService.name)
    private readonly logger: PinoLogger,
  ) {}

  private readonly steps: {
    key: keyof loginData;
    prompt: string;
    type: 'text';
  }[] = [
    {
      key: 'name',
      prompt: 'Escreva seu nome completo: (Obrigatorio)',
      type: 'text',
    },
    // {
    //   key: 'keywords',
    //   prompt: `Escreva palavras chaves para ajudar no filtro de vagas:\n ${Object.values(
    //     ECOSYSTEMS,
    //   )
    //     .map((v, i) => `${i + 1}: ${v.label}`)
    //     .join('\n')}`,
    //   type: 'text',
    // },
  ];
  private pendingLogin = new Map<
    string,
    { stepIndex: number; data: loginData }
  >();

  isPending(chatId: string) {
    return this.pendingLogin.has(chatId);
  }

  private logFor(message: pkg.Message) {
    return new ScopedLogger(this.logger, 'login', {
      chatId: maskContact(message.from),
    });
  }

  async handlePendingStep(message: pkg.Message) {
    const log = this.logFor(message);
    try {
      const pending = this.pendingLogin.get(message.from);
      if (!pending) return;

      const currentStep = this.steps[pending.stepIndex];
      pending.data[currentStep.key] = message.body;

      log.debug('step.answered', 'Passo do login respondido', {
        step: currentStep.key,
        stepIndex: pending.stepIndex,
        totalSteps: this.steps.length,
        answerLength: message.body?.length ?? 0,
      });

      const nextIndex = pending.stepIndex + 1;
      if (nextIndex < this.steps.length) {
        pending.stepIndex = nextIndex;
        await message.reply(this.steps[nextIndex].prompt);
        return;
      }

      this.pendingLogin.delete(message.from);
      await this.completeLogin(message, pending.data);
    } catch (error: unknown) {
      log.error('step.failed', 'Falha ao processar passo do login', {
        err: error,
      });
      throw new Error(String(error));
    }
  }

  async login(message: pkg.Message) {
    const log = this.logFor(message);
    log.info('start', 'Fluxo de login iniciado', {
      totalSteps: this.steps.length,
    });

    await message.reply(this.steps[0].prompt);
    this.pendingLogin.set(message.from, { stepIndex: 0, data: {} });

    log.debug('pending.size', 'Logins pendentes em memória', {
      pendingCount: this.pendingLogin.size,
    });
  }

  private async completeLogin(message: pkg.Message, data: loginData) {
    const timer = this.logFor(message).timed();

    const jobsId = (await this.jobsService.findActive(true)).map((id) => id.id);

    const contact = await getFormattedContact(client, message);

    await this.userService.createUser({
      chatId: message.from,
      contact,
      name: data.name!,
      jobsId,
    });

    timer.info('completed', 'Login concluído', {
      contact: maskContact(contact),
      jobsCount: jobsId.length,
      nameLength: data.name?.length ?? 0,
    });

    await this.getJobsAndamento.execute(message, true);
  }
}
