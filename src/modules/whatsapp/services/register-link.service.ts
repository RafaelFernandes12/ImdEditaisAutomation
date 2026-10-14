import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { UserService } from '../../user/services/user.service.js';
import { GetJobs } from './getJobs.js';
import { getFormattedContact } from './util.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { ECOSYSTEMS } from '#src/modules/web_scrapping/models/ecossystems.js';
import {
  isEscolaridade,
  isFormatoPreferencia,
  isModelo,
  isSenioridade,
} from '#src/modules/user/models/preferences.js';
import { LocalidadesService } from '../../user/services/localidades.service.js';

const LINK_TTL_MS = 30 * 60 * 1000;

type EcosystemKey = keyof typeof ECOSYSTEMS;

type PendingRegister = {
  client: pkg.Client;
  message: pkg.Message;
  expiresAt: number;
};

export type RegisterData = {
  name: string;
  ecosystems: string[];
  formato: string[];
  modelo: string[];
  senioridade: string[];
  escolaridade: string[];
  city: string;
  state: string;
};

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_link' | 'already_registered' }
  | { ok: false; reason: 'invalid_data'; error: string };

@Injectable()
export class RegisterLinkService {
  constructor(
    private jobsService: JobsService,
    private userService: UserService,
    private getJobsAndamento: GetJobs,
    private localidadesService: LocalidadesService,
    @InjectPinoLogger(RegisterLinkService.name)
    private readonly logger: PinoLogger,
  ) {}

  // Em memória: os links deixam de valer se o servidor reiniciar.
  private pending = new Map<string, PendingRegister>();

  private logFor(chatId: string) {
    return new ScopedLogger(this.logger, 'register', {
      chatId: maskContact(chatId),
    });
  }

  // Endereço do app React de cadastro (pasta web/).
  private get webUrl() {
    return (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  private removeExpired() {
    const now = Date.now();
    for (const [token, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(token);
    }
  }

  async sendLink(client: pkg.Client, message: pkg.Message) {
    this.removeExpired();

    // Um link por conversa: pedir !login de novo invalida o anterior.
    for (const [token, entry] of this.pending) {
      if (entry.message.from === message.from) this.pending.delete(token);
    }

    const token = randomBytes(24).toString('base64url');
    this.pending.set(token, {
      client,
      message,
      expiresAt: Date.now() + LINK_TTL_MS,
    });

    this.logFor(message.from).info('link.sent', 'Link de cadastro enviado', {
      pendingCount: this.pending.size,
    });

    await message.reply(
      `Para se cadastrar, preencha o formulário neste link:\n${this.webUrl}/cadastro/${token}\n\nO link vale por 30 minutos.`,
    );
  }

  isValid(token: string) {
    this.removeExpired();
    return this.pending.has(token);
  }

  async register(token: string, data: RegisterData): Promise<RegisterResult> {
    this.removeExpired();
    const entry = this.pending.get(token);
    if (!entry) return { ok: false, reason: 'invalid_link' };

    const name = data.name.trim();
    if (name.length < 2 || name.length > 120) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Digite seu nome completo.',
      };
    }

    let municipios: string[] | null;
    try {
      municipios = await this.localidadesService.listMunicipios(data.state);
    } catch {
      return {
        ok: false,
        reason: 'invalid_data',
        error:
          'Não foi possível consultar as cidades agora. Tente de novo em instantes.',
      };
    }

    if (!municipios) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha seu estado.',
      };
    }

    const city = data.city;
    if (!municipios.includes(city)) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha sua cidade.',
      };
    }

    const ecosystems = data.ecosystems.filter(
      (key): key is EcosystemKey => key in ECOSYSTEMS,
    );
    if (ecosystems.length === 0) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha pelo menos uma área de interesse.',
      };
    }

    const formato = [...new Set(data.formato.filter(isFormatoPreferencia))];
    if (formato.length === 0) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha pelo menos um formato de trabalho.',
      };
    }

    const modelo = [...new Set(data.modelo.filter(isModelo))];
    if (modelo.length === 0) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha pelo menos um modelo de contratação.',
      };
    }

    const senioridade = [...new Set(data.senioridade.filter(isSenioridade))];
    if (senioridade.length === 0) {
      return {
        ok: false,
        reason: 'invalid_data',
        error: 'Escolha pelo menos uma senioridade.',
      };
    }

    // Opcional: sem escolaridade, os editais não são filtrados por nível.
    const escolaridade = [...new Set(data.escolaridade.filter(isEscolaridade))];

    const { client, message } = entry;
    const timer = this.logFor(message.from).timed();

    if (await this.userService.findByChatId(message.from)) {
      this.pending.delete(token);
      return { ok: false, reason: 'already_registered' };
    }

    const jobsId = (await this.jobsService.findActive(true)).map((id) => id.id);
    const contact = await getFormattedContact(client, message);

    await this.userService.createUser({
      chatId: message.from,
      contact,
      name,
      jobsId,
      preferences: {
        keyWords: ecosystems.toString(),
        formato,
        modelo,
        senioridade,
        escolaridade,
        city,
        state: data.state,
      },
    });
    this.pending.delete(token);

    timer.info('completed', 'Cadastro concluído pelo formulário', {
      contact: maskContact(contact),
      jobsCount: jobsId.length,
      ecosystemsCount: ecosystems.length,
    });

    await message.reply(
      `Cadastro concluído, ${name.split(' ')[0]}! ✅\nA partir de agora você vai receber as novas vagas por aqui.`,
    );
    await this.getJobsAndamento.execute(message, true);

    return { ok: true };
  }
}
