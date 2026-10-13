import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const TIMEOUT_MS = 10_000;

export type Estado = { sigla: string; nome: string };

@Injectable()
export class LocalidadesService {
  constructor(
    @InjectPinoLogger(LocalidadesService.name)
    private readonly logger: PinoLogger,
  ) {}

  // Estados e municípios quase nunca mudam: guarda a resposta do IBGE até o
  // servidor reiniciar. Só respostas com sucesso ficam no cache.
  private cache = new Map<string, Promise<unknown>>();

  private get log() {
    return new ScopedLogger(this.logger, 'localidades');
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${IBGE_URL}${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`IBGE respondeu ${res.status} em ${path}`);
    return (await res.json()) as T;
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Promise<T> | undefined;
    if (hit) return hit;

    const promise = load().catch((err: unknown) => {
      this.cache.delete(key);
      this.log.error('fetch.failed', 'Falha ao consultar o IBGE', { key, err });
      throw err;
    });
    this.cache.set(key, promise);
    return promise;
  }

  listEstados(): Promise<Estado[]> {
    return this.cached('estados', async () => {
      const estados = await this.fetchJson<Estado[]>('/estados?orderBy=nome');
      return estados.map(({ sigla, nome }) => ({ sigla, nome }));
    });
  }

  async isUf(uf: string) {
    return (await this.listEstados()).some((estado) => estado.sigla === uf);
  }

  /** Nomes dos municípios da UF, ou null se a UF não existe. */
  async listMunicipios(uf: string): Promise<string[] | null> {
    // O IBGE devolve [] para UF inválida, então confere antes.
    if (!(await this.isUf(uf))) return null;

    return this.cached(`municipios:${uf}`, async () => {
      const municipios = await this.fetchJson<{ nome: string }[]>(
        `/estados/${uf}/municipios?orderBy=nome`,
      );
      return municipios.map(({ nome }) => nome);
    });
  }
}
