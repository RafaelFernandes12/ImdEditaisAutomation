import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  RegisterData,
  RegisterLinkService,
} from '../services/register-link.service.js';
import { LocalidadesService } from '../../user/services/localidades.service.js';
import { ECOSYSTEMS } from '#src/modules/web_scrapping/models/ecossystems.js';
import {
  FORMATO_PREFERENCIA_LABELS,
  MODELO_LABELS,
  SENIORIDADE_LABELS,
} from '#src/modules/user/models/preferences.js';

type CadastroBody = {
  name?: unknown;
  city?: unknown;
  state?: unknown;
  ecosystems?: unknown;
  formato?: unknown;
  modelo?: unknown;
  senioridade?: unknown;
};

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

// Aceita tanto um valor solto quanto uma lista.
function list(value: unknown) {
  return [value ?? []].flat().filter((v) => typeof v === 'string');
}

function options(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}

const INVALID_LINK = {
  reason: 'invalid_link',
  message:
    'Este link expirou ou já foi usado. Envie !login no WhatsApp para receber um novo.',
};

const IBGE_UNAVAILABLE = {
  reason: 'ibge_unavailable',
  message:
    'Não foi possível carregar a lista de estados agora. Tente de novo daqui a pouco.',
};

@Controller('cadastro')
export class CadastroController {
  constructor(
    private readonly registerLinkService: RegisterLinkService,
    private readonly localidadesService: LocalidadesService,
  ) {}

  @Get('cidades/:uf')
  async cities(@Param('uf') uf: string) {
    let municipios: string[] | null;
    try {
      municipios = await this.localidadesService.listMunicipios(uf);
    } catch {
      throw new ServiceUnavailableException('IBGE indisponível');
    }
    if (!municipios) throw new NotFoundException('UF inválida');
    return municipios;
  }

  // Confere o link e devolve as opções que o formulário precisa.
  @Get(':token')
  async form(@Param('token') token: string) {
    if (!this.registerLinkService.isValid(token))
      throw new NotFoundException(INVALID_LINK);

    let estados: Awaited<ReturnType<LocalidadesService['listEstados']>>;
    try {
      estados = await this.localidadesService.listEstados();
    } catch {
      throw new ServiceUnavailableException(IBGE_UNAVAILABLE);
    }

    return {
      estados,
      ecosystems: Object.entries(ECOSYSTEMS).map(([value, { label }]) => ({
        value,
        label,
      })),
      formatos: options(FORMATO_PREFERENCIA_LABELS),
      modelos: options(MODELO_LABELS),
      senioridades: options(SENIORIDADE_LABELS),
    };
  }

  @Post(':token')
  async submit(@Param('token') token: string, @Body() body: CadastroBody) {
    const data: RegisterData = {
      name: text(body?.name),
      city: text(body?.city),
      state: text(body?.state),
      ecosystems: list(body?.ecosystems),
      formato: text(body?.formato),
      modelo: list(body?.modelo),
      senioridade: list(body?.senioridade),
    };

    const result = await this.registerLinkService.register(token, data);
    if (result.ok) return { ok: true };

    switch (result.reason) {
      case 'invalid_link':
        throw new NotFoundException(INVALID_LINK);
      case 'already_registered':
        throw new ConflictException({
          reason: 'already_registered',
          message: 'Este número já tem cadastro. É só voltar para o WhatsApp.',
        });
      case 'invalid_data':
        throw new BadRequestException({
          reason: 'invalid_data',
          message: result.error,
        });
    }
  }
}
