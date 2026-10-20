import type { VagaJobPayload } from '../strategy/new-job.strategy.js';

// Vaga achada na busca de Natal de uma fonte é de Natal, seja qual for o local
// que a fonte ou a IA lerem.
export function inNatal(job: VagaJobPayload): VagaJobPayload {
  return {
    ...job,
    attributes: {
      ...job.attributes,
      city: 'Natal',
      state: 'RN',
      isInternational: false,
    },
  };
}
