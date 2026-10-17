import type { ActiveJob } from '../modules/jobs/services/jobs.service.js';
import { JOB_TYPES } from '../modules/jobs/job-types.js';
import { formatDate } from './formate-date.js';

// Edital pode ter vários perfis: um resumo por vaga, separados por linha em branco.
export function formatVagasSummary({
  vagas,
}: {
  vagas: { summary: string }[];
}) {
  return vagas.map((vaga) => vaga.summary).join('\n\n');
}

// Uma vaga por item, na ordem recebida (do mais para o menos compatível).
// A fonte vai no fim da linha do cargo (<vaga> | <cidade>/<UF> | <fonte>),
// e a vaga de edital leva o link do edital (primeiro pdf), repetido em cada
// perfil do mesmo edital.
export function formatRankedVagas(
  ranked: { job: ActiveJob; vaga: { summary: string } }[],
) {
  return ranked
    .map(({ job, vaga }, index) => {
      const isEdital = job.kind === 'EDITAL';
      const link = isEdital ? (job.pdfs[0]?.link ?? job.link) : job.link;
      const inscricoes =
        isEdital && job.subscriptionUntil
          ? `🗓️ Inscrições até: ${formatDate(job.subscriptionUntil)}\n`
          : '';

      const [titulo, ...resto] = vaga.summary.split('\n');
      const summary = [`${titulo} | ${JOB_TYPES[job.type].source}`, ...resto];

      return `*${index + 1}.* ${summary.join('\n')}\n${inscricoes}🔗 ${link}`;
    })
    .join('\n\n');
}
