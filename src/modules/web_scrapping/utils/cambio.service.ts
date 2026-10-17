import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import type { Cotacoes } from './cambio.util.js';

// Gratuita e sem chave; uma chamada traz todas as moedas, com base no real.
const CAMBIO_URL = 'https://open.er-api.com/v6/latest/BRL';
const TIMEOUT_MS = 10_000;
// A API atualiza as cotações uma vez por dia.
const TTL_MS = 12 * 60 * 60 * 1000;

type CambioResponse = { result: string; rates?: Record<string, number> };

@Injectable()
export class CambioService {
  constructor(
    @InjectPinoLogger(CambioService.name)
    private readonly logger: PinoLogger,
  ) {}

  private cache: { at: number; cotacoes: Promise<Cotacoes> } | null = null;

  private get log() {
    return new ScopedLogger(this.logger, 'cambio');
  }

  /**
   * Cotações em reais. Se a API falhar devolve {}: o salário em moeda
   * estrangeira fica sem valor em reais em vez de travar o resumo da vaga.
   */
  async cotacoes(): Promise<Cotacoes> {
    if (!this.cache || Date.now() - this.cache.at > TTL_MS) {
      this.cache = { at: Date.now(), cotacoes: this.load() };
    }

    try {
      return await this.cache.cotacoes;
    } catch (err: unknown) {
      this.cache = null;
      this.log.warn('fetch.failed', 'Falha ao consultar as cotações', { err });
      return {};
    }
  }

  private async load(): Promise<Cotacoes> {
    const res = await fetch(CAMBIO_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`API de câmbio respondeu ${res.status}`);

    const body = (await res.json()) as CambioResponse;
    if (body.result !== 'success' || !body.rates) {
      throw new Error('API de câmbio não devolveu as cotações');
    }

    // A API diz quanto 1 real vale em cada moeda; aqui fica o inverso.
    return Object.fromEntries(
      Object.entries(body.rates)
        .filter(([, rate]) => rate > 0)
        .map(([code, rate]) => [code, 1 / rate]),
    );
  }
}
