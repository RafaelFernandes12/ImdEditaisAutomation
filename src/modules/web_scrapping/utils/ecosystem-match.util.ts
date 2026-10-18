import { ECOSYSTEMS } from '../models/ecossystems.js';

// Termo casa só como palavra inteira: 'go' não pode casar com 'governo' nem
// 'java' com 'javascript'.
const ECOSYSTEM_TERMS = Object.values(ECOSYSTEMS)
  .flatMap(({ terms }): readonly string[] => terms)
  .map((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      term,
      regex: new RegExp(
        String.raw`(?<![\p{L}\p{N}])${escaped}(?![\p{L}\p{N}])`,
        'u',
      ),
    };
  });

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

export function matchesEcosystem(text: string) {
  const normalized = normalize(text);
  return ECOSYSTEM_TERMS.some(({ regex }) => regex.test(normalized));
}

// Termos distintos citados no texto: repetir o mesmo termo não conta de novo.
export function matchedEcosystemTerms(text: string) {
  const normalized = normalize(text);
  return ECOSYSTEM_TERMS.filter(({ regex }) => regex.test(normalized)).map(
    ({ term }) => term,
  );
}
