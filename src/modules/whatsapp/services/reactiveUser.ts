import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { UserService } from '../../user/services/user.service.js';
import { getFormattedContact } from './util.service.js';

@Injectable()
export class ReactiveUser {
  constructor(private readonly userService: UserService) {}

  async execute(client: pkg.Client, message: pkg.Message) {
    await this.userService.reactiveUser(
      await getFormattedContact(client, message),
    );

    await message.reply(
      `📢 Usuário reativado com sucesso, para desativar digite *!desativar'*`,
    );
  }
}
