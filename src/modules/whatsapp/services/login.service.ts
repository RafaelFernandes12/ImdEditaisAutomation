import { Injectable } from '@nestjs/common';
import { WhatsappRepository } from '../repositories/whatsapp.repository.js';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';

@Injectable()
export class LoginService {
  constructor(
    private whatsappRepository: WhatsappRepository,
    private userService: UserService,
    private getEditaisAndamento: GetEditaisAndamento,
    private readonly logger: Logger,
  ) {}

  private pendingLogin = new Map<
    string,
    { step: 'name' } | { step: 'matricula'; name: string }
  >();

  isPending(chatId: string) {
    return this.pendingLogin.has(chatId);
  }

  async handlePendingStep(message: pkg.Message) {
    const pending = this.pendingLogin.get(message.from);
    if (!pending) {
      return;
    }

    if (pending.step === 'name') {
      this.pendingLogin.set(message.from, {
        step: 'matricula',
        name: message.body,
      });
      await message.reply('Agora escreva sua matrícula:');
      return;
    }

    this.pendingLogin.delete(message.from);
    await this.completeLogin(message, pending.name);
  }

  async login(message: pkg.Message) {
    await message.reply('Escreva seu nome completo:');
    this.pendingLogin.set(message.from, { step: 'name' });
  }

  private async completeLogin(message: pkg.Message, name: string) {
    const matricula = message.body;
    const editaisId = (await this.whatsappRepository.getEditaisActive()).map(
      (id) => id.id,
    );
    await this.userService.createUser({
      chatId: message.from,
      contact: await client.getFormattedNumber(message.to),
      name,
      matricula,
      editaisId,
    });
    await this.getEditaisAndamento.execute(message);
  }
}
