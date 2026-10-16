// Quanto vale 1 unidade de cada moeda em reais (ex: { USD: 5.06 }).
export type Cotacoes = Record<string, number>;

// A IA devolve o código ISO 4217; sem moeda, o valor é em reais.
export function moedaDe(moeda: string | null) {
  return moeda?.trim().toUpperCase() || 'BRL';
}

/** Valor em reais, ou null se não houver cotação para a moeda. */
export function toBrl(value: number, moeda: string | null, cotacoes: Cotacoes) {
  const code = moedaDe(moeda);
  if (code === 'BRL') return value;

  const cotacao = cotacoes[code];
  if (!cotacao) return null;
  return Math.round(value * cotacao * 100) / 100;
}
