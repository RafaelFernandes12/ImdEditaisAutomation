import type { VagaAttributes } from '#src/modules/jobs/dto/jobs.dto.js';
import type { VagaResumida } from '#src/modules/ai_chat/services/summarize-job.service.js';

function text(value: string | null) {
  return value?.trim() || null;
}

// A IA já devolve formato, modalidade, senioridade e escolaridade como valores
// dos enums.
export function vagaAttributes(vaga: VagaResumida): VagaAttributes {
  return {
    ecossytem: vaga.ecossystems.join(', '),
    salary: vaga.remuneração,
    formato: vaga.formato,
    city: text(vaga.cidade),
    state: text(vaga.estado),
    modelo: vaga.modalidade,
    senioridade: vaga.senioridade,
    escolaridade: vaga.escolaridade,
  };
}
