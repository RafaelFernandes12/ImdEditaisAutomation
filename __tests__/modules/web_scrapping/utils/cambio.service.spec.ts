import type { PinoLogger } from 'nestjs-pino';
import { CambioService } from '../../../../src/modules/web_scrapping/utils/cambio.service.js';

const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

function mockFetch(body: unknown, ok = true) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      json: () => Promise.resolve(body),
    } as Response);
}

describe('CambioService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('converte as taxas da API para quanto cada moeda vale em reais', async () => {
    const fetch = mockFetch({
      result: 'success',
      rates: { BRL: 1, USD: 0.2, EUR: 0.25 },
    });
    const service = new CambioService(logger);

    await expect(service.cotacoes()).resolves.toEqual({
      BRL: 1,
      USD: 5,
      EUR: 4,
    });
    // Segunda chamada usa o cache.
    await service.cotacoes();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('devolve {} quando a API falha e tenta de novo na próxima vez', async () => {
    const fetch = mockFetch({}, false);
    const service = new CambioService(logger);

    await expect(service.cotacoes()).resolves.toEqual({});
    await service.cotacoes();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
