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
import { ScopedLogger } from '../../../utils/scoped-logger.js';

const commands = [
  '!ping',
  '!vagas',
  '!vagas andamento',
  '!desativar',
  '!reativar',
  '!citado',
];

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
    client.on('message', (message) => {
      this.handleMessage(client, message).catch((err: unknown) =>
        this.logFor(message).error(
          'message.unhandled_error',
          'Erro não tratado ao processar mensagem',
          { err },
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
      this.deactiveUser.execute(_client, message),
    '!reativar': (_client, message) =>
      this.reactiveUser.execute(_client, message),
    '!citado': (_client, message) => this.getNamesCitados.execute(message),
  };

  private logFor(message: pkg.Message) {
    return new ScopedLogger(this.logger, 'wa', {
      chatId: maskContact(message.from),
    });
  }

  private async handleMessage(client: pkg.Client, message: pkg.Message) {
    const log = this.logFor(message);
    log.debug('message.received', 'Mensagem recebida', {
      fromMe: message.fromMe,
      bodyLength: message.body?.length ?? 0,
    });

    if (this.loginService.isPending(message.from)) {
      await this.loginService.handlePendingStep(message);
      return;
    }

    if (message.body === '!login') {
      await this.loginService.login(message);
      return;
    }

    const command = this.commands[message.body];
    const user = await this.userService.findByChatId(message.from);
    if (!commands.includes(message.body) && user) {
      await message.reply(`Essa é a lista de comandos: 
'!ping': pinga o servidor
'!vagas': Verifica todas as vagas abertas
'!vagas andamento': Verifica todas as vagas em andamento
'!desativar': Desativa usuário, você para de receber as mensagens automáticas,
'!reativar': Reativa usuário,
'!citado': Pega editais em que o seu nome foi mencionado
`);
      return;
    }

    if (!user) {
      log.info(
        'command.unauthorized',
        'Comando recebido de usuário sem login',
        {
          command: message.body,
        },
      );
      await message.reply(
        'Você precisa fazer login primeiro. Envie !login para começar.',
      );
      return;
    }

    const commandLog = log
      .child({ command: message.body, userId: user.id })
      .timed();

    try {
      await command(client, message);

      commandLog.info('command.done', 'Comando executado');
    } catch (error: unknown) {
      commandLog.error('command.failed', 'Falha ao executar comando', {
        err: error,
      });
      throw error;
    }
  }

  private async ping(message: pkg.Message) {
    await message.reply('pong');
  }
}
