jest.mock('../../../src/modules/jobs/services/jobs.service.js', () => ({
  JobsService: class {},
}));
jest.mock('../../../src/modules/user/services/user.service.js', () => ({
  UserService: class {},
}));
jest.mock('../../../src/modules/whatsapp/services/getJobs.js', () => ({
  GetJobs: class {},
}));

import type pkg from 'whatsapp-web.js';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { RegisterLinkService } from '../../../src/modules/whatsapp/services/register-link.service.js';
import { CadastroController } from '../../../src/modules/whatsapp/controllers/cadastro.controller.js';
import type { JobsService } from '../../../src/modules/jobs/services/jobs.service.js';
import type { UserService } from '../../../src/modules/user/services/user.service.js';
import type { GetJobs } from '../../../src/modules/whatsapp/services/getJobs.js';
import { LocalidadesService } from '../../../src/modules/user/services/localidades.service.js';

const CHAT_ID = '5584999999999@c.us';

// Respostas da API de localidades do IBGE.
const IBGE: Record<string, unknown> = {
  '/estados?orderBy=nome': [
    { id: 26, sigla: 'PE', nome: 'Pernambuco', regiao: {} },
    { id: 24, sigla: 'RN', nome: 'Rio Grande do Norte', regiao: {} },
  ],
  '/estados/RN/municipios?orderBy=nome': [
    { id: 2408003, nome: 'Mossoró' },
    { id: 2408102, nome: 'Natal' },
  ],
  '/estados/PE/municipios?orderBy=nome': [{ id: 2611606, nome: 'Recife' }],
};

function mockIbge(available = true) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const path = (input as string).replace(
      'https://servicodados.ibge.gov.br/api/v1/localidades',
      '',
    );
    if (!available) return Promise.resolve(new Response(null, { status: 503 }));
    return Promise.resolve(Response.json(IBGE[path] ?? []));
  });
}

function setup() {
  const jobsService = { findActive: jest.fn().mockResolvedValue([{ id: 7 }]) };
  const userService = {
    findByChatId: jest.fn().mockResolvedValue(null),
    createUser: jest.fn().mockResolvedValue({ id: 1 }),
  };
  const getJobs = { execute: jest.fn().mockResolvedValue(undefined) };
  const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const localidades = new LocalidadesService(logger as unknown as PinoLogger);
  const service = new RegisterLinkService(
    jobsService as unknown as JobsService,
    userService as unknown as UserService,
    getJobs as unknown as GetJobs,
    localidades,
    logger as unknown as PinoLogger,
  );
  const controller = new CadastroController(service, localidades);

  const client = {
    getFormattedNumber: jest.fn().mockResolvedValue('+55 84 99999-9999'),
  } as unknown as pkg.Client;
  const message = {
    from: CHAT_ID,
    reply: jest.fn().mockResolvedValue(undefined),
  };

  return { service, controller, client, message, userService, getJobs };
}

function replyText(reply: jest.Mock): string {
  return (reply.mock.calls as string[][])[0][0];
}

function tokenFrom(reply: jest.Mock): string {
  const text = replyText(reply);
  return /\/cadastro\/([\w-]+)/.exec(text)![1];
}

async function submitError(
  controller: CadastroController,
  token: string,
  body: Parameters<CadastroController['submit']>[1],
): Promise<HttpException> {
  try {
    await controller.submit(token, body);
  } catch (err) {
    return err as HttpException;
  }
  throw new Error('submit deveria ter falhado');
}

describe('cadastro pelo link', () => {
  beforeEach(() => {
    process.env.WEB_URL = 'https://cadastro.exemplo.com/';
    mockIbge();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('manda o link e cria o usuário com as chaves dos ecossistemas escolhidos', async () => {
    const { service, controller, client, message, userService, getJobs } =
      setup();

    await service.sendLink(client, message as unknown as pkg.Message);
    expect(replyText(message.reply)).toContain(
      'https://cadastro.exemplo.com/cadastro/',
    );
    const token = tokenFrom(message.reply);

    const form = await controller.form(token);
    expect(form.estados).toContainEqual({
      sigla: 'RN',
      nome: 'Rio Grande do Norte',
    });
    expect(form.ecosystems).toContainEqual({ value: 'java', label: 'Java' });
    expect(form.formatos.map((f) => f.value)).toEqual([
      'PRESENCIAL',
      'HIBRIDO',
      'REMOTO',
    ]);
    expect(form.modelos).toContainEqual({ value: 'PJ', label: 'PJ' });
    expect(form.senioridades).toContainEqual({
      value: 'PLENO',
      label: 'Pleno',
    });
    expect(form.escolaridades).toContainEqual({
      value: 'GRADUACAO',
      label: 'Graduação',
    });

    const result = await controller.submit(token, {
      name: '  Maria Silva ',
      city: 'Natal',
      state: 'RN',
      ecosystems: ['java', 'naoexiste'],
      formato: ['REMOTO', 'HIBRIDO', 'REMOTO', 'NAO_INFORMADO'],
      modelo: ['CLT', 'PJ', 'CLT', 'xx'],
      senioridade: 'PLENO',
      escolaridade: ['GRADUADO', 'MESTRADO', 'GRADUADO', 'xx'],
    });

    expect(result).toEqual({ ok: true });
    expect(userService.createUser).toHaveBeenCalledWith({
      chatId: CHAT_ID,
      contact: '+55 84 99999-9999',
      name: 'Maria Silva',
      jobsId: [7],
      preferences: {
        keyWords: 'java',
        formato: ['REMOTO', 'HIBRIDO'],
        modelo: ['CLT', 'PJ'],
        senioridade: ['PLENO'],
        escolaridade: ['GRADUADO', 'MESTRADO'],
        city: 'Natal',
        state: 'RN',
      },
    });
    expect(getJobs.execute).toHaveBeenCalledWith(message, true);

    // O link é de uso único.
    await expect(controller.form(token)).rejects.toThrow(NotFoundException);
    await expect(controller.submit(token, { name: 'Maria' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aceita um valor solto no lugar de uma lista', async () => {
    const { service, controller, client, message, userService } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);

    await controller.submit(tokenFrom(message.reply), {
      name: 'Maria',
      city: 'Natal',
      state: 'RN',
      ecosystems: 'java',
      formato: 'HIBRIDO',
      modelo: 'CLT',
      senioridade: 'JUNIOR',
      escolaridade: 'GRADUACAO',
    });

    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          formato: ['HIBRIDO'],
          modelo: ['CLT'],
          senioridade: ['JUNIOR'],
          escolaridade: ['GRADUACAO'],
        }) as object,
      }),
    );
  });

  it('escolaridade é opcional', async () => {
    const { service, controller, client, message, userService } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);

    await controller.submit(tokenFrom(message.reply), {
      name: 'Maria',
      city: 'Natal',
      state: 'RN',
      ecosystems: 'java',
      formato: 'REMOTO',
      modelo: 'CLT',
      senioridade: 'JUNIOR',
    });

    expect(userService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({ escolaridade: [] }) as object,
      }),
    );
  });

  it('devolve 400 com o erro e mantém o link válido quando falta área', async () => {
    const { service, controller, client, message, userService } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);
    const token = tokenFrom(message.reply);

    const error = await submitError(controller, token, {
      name: 'Maria',
      city: 'Natal',
      state: 'RN',
      formato: 'REMOTO',
      modelo: 'CLT',
    });

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      reason: 'invalid_data',
      message: 'Escolha pelo menos uma área de interesse.',
    });
    expect(userService.createUser).not.toHaveBeenCalled();
    expect(service.isValid(token)).toBe(true);
  });

  it('devolve 409 quando o número já tem cadastro', async () => {
    const { service, controller, client, message, userService } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);
    userService.findByChatId.mockResolvedValue({ id: 1 });

    const error = await submitError(controller, tokenFrom(message.reply), {
      name: 'Maria',
      city: 'Natal',
      state: 'RN',
      ecosystems: ['java'],
      formato: 'REMOTO',
      modelo: ['CLT'],
      senioridade: ['PLENO'],
    });

    expect(error).toBeInstanceOf(ConflictException);
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ state: 'XX' }, 'Escolha seu estado.'],
    [{ city: 'Recife' }, 'Escolha sua cidade.'],
    [
      { formato: 'NAO_INFORMADO' },
      'Escolha pelo menos um formato de trabalho.',
    ],
    [{ modelo: undefined }, 'Escolha pelo menos um modelo de contratação.'],
    [{ senioridade: ['xx'] }, 'Escolha pelo menos uma senioridade.'],
  ])('recusa o envio com %o', async (override, error) => {
    const { service, controller, client, message, userService } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);

    const result = await submitError(controller, tokenFrom(message.reply), {
      name: 'Maria',
      city: 'Natal',
      state: 'RN',
      ecosystems: 'java',
      formato: 'REMOTO',
      modelo: 'CLT',
      senioridade: 'PLENO',
      ...override,
    });

    expect(result.getResponse()).toEqual({
      reason: 'invalid_data',
      message: error,
    });
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('lista as cidades do estado e guarda a resposta do IBGE', async () => {
    const { controller } = setup();

    expect(await controller.cities('RN')).toEqual(['Mossoró', 'Natal']);
    expect(await controller.cities('RN')).toEqual(['Mossoró', 'Natal']);
    await expect(controller.cities('XX')).rejects.toThrow('UF inválida');
    // Uma vez a lista de estados e uma vez as cidades do RN.
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('avisa quando o IBGE está fora do ar e tenta de novo depois', async () => {
    const { service, controller, client, message } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);
    const token = tokenFrom(message.reply);

    jest.restoreAllMocks();
    mockIbge(false);
    await expect(controller.form(token)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(controller.cities('RN')).rejects.toThrow('IBGE indisponível');

    jest.restoreAllMocks();
    mockIbge();
    expect((await controller.form(token)).estados).toContainEqual({
      sigla: 'RN',
      nome: 'Rio Grande do Norte',
    });
  });

  it('pedir !login de novo invalida o link anterior', async () => {
    const { service, client, message } = setup();
    await service.sendLink(client, message as unknown as pkg.Message);
    const first = tokenFrom(message.reply);

    message.reply.mockClear();
    await service.sendLink(client, message as unknown as pkg.Message);

    expect(service.isValid(first)).toBe(false);
    expect(service.isValid(tokenFrom(message.reply))).toBe(true);
  });

  it('expira depois de 30 minutos', async () => {
    jest.useFakeTimers();
    try {
      const { service, client, message } = setup();
      await service.sendLink(client, message as unknown as pkg.Message);
      const token = tokenFrom(message.reply);

      jest.advanceTimersByTime(30 * 60 * 1000);

      expect(service.isValid(token)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
