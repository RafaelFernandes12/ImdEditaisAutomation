import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { UploadOne } from '../../../modules/files/upload-one.js';

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
    private readonly logger: Logger,
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

      const nextIndex = pending.stepIndex + 1;
      if (nextIndex < this.steps.length) {
        pending.stepIndex = nextIndex;
        await message.reply(this.steps[nextIndex].prompt);
        return;
      }

      this.pendingLogin.delete(message.from);
      await this.completeLogin(message, pending.data);
    } catch (e) {
      console.log(e);
      throw new Error(e);
    }
  }

  async login(message: pkg.Message) {
    await message.reply(this.steps[0].prompt);
    this.pendingLogin.set(message.from, { stepIndex: 0, data: {} });
  }

  private async completeLogin(message: pkg.Message, data: loginData) {
    const editaisId = (await this.editalService.findActive()).map(
      (id) => id.id,
    );

    await this.userService.createUser({
      chatId: message.from,
      contact: await this.getFormattedContact(message),
      name: data.name!,
      editaisId,
    });
    await this.getEditaisAndamento.execute(message);
  }

  /**
   * message.from pode vir como um LID (ex: 121642315460836@lid), que nao e um
   * telefone. Resolve o LID para o numero real antes de formatar.
   */
  private async getFormattedContact(message: pkg.Message) {
    let userId = message.from;

    if (userId.endsWith('@lid')) {
      const [resolved] = await client.getContactLidAndPhone([userId]);

      if (!resolved?.pn) {
        const contact = await message.getContact();
        return contact.number ?? userId;
      }

      userId = resolved.pn;
    }

    return client.getFormattedNumber(userId);
  }

  private parseOptional(value?: string) {
    return value && value.trim().toUpperCase() !== 'NAO' ? value : undefined;
  }
}
