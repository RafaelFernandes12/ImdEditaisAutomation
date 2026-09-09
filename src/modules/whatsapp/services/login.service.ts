import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { UploadOne } from '../../../modules/files/upload-one.js';
import { maskContact } from '../../../utils/log-redact.js';

type loginData = {
  name?: string;
  matricula?: string;
  vitae?: string;
  lattes?: string;
};

@Injectable()
export class LoginService {
  constructor(
    private editalService: EditalService,
    private userService: UserService,
    private getEditaisAndamento: GetEditaisAndamento,
    private uploadOne: UploadOne,
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
  ];
  private pendingLogin = new Map<
    string,
    { stepIndex: number; data: loginData }
  >();

  isPending(chatId: string) {
    return this.pendingLogin.has(chatId);
  }

  async handlePendingStep(message: pkg.Message) {
    try {
      const pending = this.pendingLogin.get(message.from);
      if (!pending) return;

      const currentStep = this.steps[pending.stepIndex];
      pending.data[currentStep.key] = message.body;

      this.logger.debug(
        {
          evt: 'login.step.answered',
          chatId: maskContact(message.from),
          step: currentStep.key,
          stepIndex: pending.stepIndex,
          totalSteps: this.steps.length,
          answerLength: message.body?.length ?? 0,
        },
        'Passo do login respondido',
      );

      const nextIndex = pending.stepIndex + 1;
      if (nextIndex < this.steps.length) {
        pending.stepIndex = nextIndex;
        await message.reply(this.steps[nextIndex].prompt);
        return;
      }

      this.pendingLogin.delete(message.from);
      await this.completeLogin(message, pending.data);
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'login.step.failed',
          chatId: maskContact(message.from),
          err: error,
        },
        'Falha ao processar passo do login',
      );
      throw new Error(String(error));
    }
  }

  async login(message: pkg.Message) {
    this.logger.info(
      {
        evt: 'login.start',
        chatId: maskContact(message.from),
        totalSteps: this.steps.length,
      },
      'Fluxo de login iniciado',
    );

    await message.reply(this.steps[0].prompt);
    this.pendingLogin.set(message.from, { stepIndex: 0, data: {} });

    this.logger.debug(
      { evt: 'login.pending.size', pendingCount: this.pendingLogin.size },
      'Logins pendentes em memória',
    );
  }

  private async completeLogin(message: pkg.Message, data: loginData) {
    const startedAt = Date.now();

    const editaisId = (await this.editalService.findActive()).map(
      (id) => id.id,
    );

    const contact = await this.getFormattedContact(message);

    await this.userService.createUser({
      chatId: message.from,
      contact,
      name: data.name!,
      editaisId,
    });

    this.logger.info(
      {
        evt: 'login.completed',
        chatId: maskContact(message.from),
        contact: maskContact(contact),
        editaisCount: editaisId.length,
        nameLength: data.name?.length ?? 0,
        durationMs: Date.now() - startedAt,
      },
      'Login concluído',
    );

    await this.getEditaisAndamento.execute(message);
  }

  private async getFormattedContact(message: pkg.Message) {
    let userId = message.from;

    if (userId.endsWith('@lid')) {
      const [resolved] = await client.getContactLidAndPhone([userId]);

      if (!resolved?.pn) {
        const contact = await message.getContact();
        this.logger.warn(
          {
            evt: 'login.contact.lid_unresolved',
            chatId: maskContact(message.from),
            fallbackFound: Boolean(contact.number),
          },
          'Não foi possível resolver o telefone a partir do @lid',
        );
        return contact.number ?? userId;
      }

      this.logger.debug(
        {
          evt: 'login.contact.lid_resolved',
          chatId: maskContact(message.from),
        },
        'Telefone resolvido a partir do @lid',
      );

      userId = resolved.pn;
    }

    return client.getFormattedNumber(userId);
  }
}
