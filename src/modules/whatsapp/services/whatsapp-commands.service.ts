import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { client } from '../../../config/whatsapp/client.js';
import { LoginService } from './login.service.js';
import { GetJobs } from './getJobs.js';
import { UserService } from '../../user/services/user.service.js';
import { DeactiveUser } from './deactiveUser.js';
import { maskContact } from '../../../utils/log-redact.js';
import { ReactiveUser } from './reactiveUser.js';
import { GetNamesCitados } from './getNamesCitados.js';

@Injectable()
export class WhatsappCommandsService {
  constructor(
    private loginService: LoginService,
    private getJobs: GetJobs,
    private userService: UserService,
    @InjectPinoLogger(WhatsappCommandsService.name)
    private readonly logger: PinoLogger,
    private readonly deactiveUser: DeactiveUser,
    private readonly reactiveUser: ReactiveUser,
    private readonly getNamesCitados: GetNamesCitados,
  ) {}

  execute(client: pkg.Client) {
    client.on('message_create', (message) => {
      this.handleMessage(client, message).catch((err: unknown) =>
        this.logger.error(
          {
            evt: 'wa.message.unhandled_error',
            chatId: maskContact(message.from),
            err,
          },
          'Erro não tratado ao processar mensagem',
        ),
      );
    });
  }
  private readonly commands: Record<
    string,
    (client: pkg.Client, message: pkg.Message) => Promise<void>
  > = {
    '!ping': (_client, message) => this.ping(message),
    '!vagas': (_client, message) => this.getJobs.execute(message, false),
    '!vagas andamento': (_client, message) =>
      this.getJobs.execute(message, true),
    '!desativar': (_client, message) =>
      this.deactiveUser.execute(client, message),
    '!reativar': (_client, message) =>
      this.reactiveUser.execute(client, message),
    '!citado': (_client, message) => this.getNamesCitados.execute(message),
  };

  private async handleMessage(client: pkg.Client, message: pkg.Message) {
    this.logger.debug(
      {
        evt: 'wa.message.received',
        chatId: maskContact(message.from),
        fromMe: message.fromMe,
        bodyLength: message.body?.length ?? 0,
      },
      'Mensagem recebida',
    );

    if (this.loginService.isPending(message.from)) {
      await this.loginService.handlePendingStep(message);
      return;
    }

    if (message.body === '!login') {
      await this.loginService.login(message);
      return;
    }

    const command = this.commands[message.body];
    if (!command) {
      return;
    }

    const user = await this.userService.findByChatId(message.from);
    if (!user) {
      this.logger.info(
        {
          evt: 'wa.command.unauthorized',
          command: message.body,
          chatId: maskContact(message.from),
        },
        'Comando recebido de usuário sem login',
      );
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    const startedAt = Date.now();

    try {
      await command(client, message);

      this.logger.info(
        {
          evt: 'wa.command.done',
          command: message.body,
          userId: user.id,
          durationMs: Date.now() - startedAt,
        },
        'Comando executado',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'wa.command.failed',
          command: message.body,
          userId: user.id,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao executar comando',
      );
      throw error;
    }
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }
}
