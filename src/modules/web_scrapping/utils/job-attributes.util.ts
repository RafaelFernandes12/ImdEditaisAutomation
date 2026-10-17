import type { VagaAttributes } from '#src/modules/jobs/dto/jobs.dto.js';
import type { VagaResumida } from '#src/modules/ai_chat/services/summarize-job.service.js';
import { Cotacoes, toBrl } from './cambio.util.js';

function text(value: string | null) {
  return value?.trim() || null;
}

// A IA já devolve formato, modalidade, senioridade e escolaridade como valores
// dos enums. O salário é gravado em reais, convertido pelas cotações.
export function vagaAttributes(
  vaga: VagaResumida,
  cotacoes: Cotacoes = {},
): VagaAttributes {
  return {
    ecossytem: vaga.ecossystems.join(', '),
    salary:
      vaga.remuneração === null
        ? null
        : toBrl(vaga.remuneração, vaga.moeda, cotacoes),
    formato: vaga.formato,
    city: text(vaga.cidade),
    state: text(vaga.estado),
    modelo: vaga.modalidade,
    senioridade: vaga.senioridade,
    escolaridade: vaga.escolaridade,
  };
}
