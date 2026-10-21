import * as cheerio from 'cheerio';

// Quebra de linha depois de cada bloco: sem ela, "<li>Java</li><li>Spring"
// vira "JavaSpring" e nenhum dos dois termos casa.
export function htmlToText(html: string | null) {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('p, li, br, div, h1, h2, h3, h4, h5, h6').after('\n');
  return $.root()
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
