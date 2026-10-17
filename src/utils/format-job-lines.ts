import type { ActiveJob } from '../modules/jobs/services/jobs.service.js';
import {
  ALL_JOB_TYPES,
  JOB_TYPES,
  JobKind,
} from '../modules/jobs/job-types.js';
import { formatDate } from './formate-date.js';

// Edital pode ter vários perfis: um resumo por vaga, separados por linha em branco.
export function formatVagasSummary({
  vagas,
}: {
  vagas: { summary: string }[];
}) {
  return vagas.map((vaga) => vaga.summary).join('\n\n');
}

export function formatEditalLines(editais: ActiveJob[]) {
  return editais
    .map((job, index) => {
      const pdfLines = job.pdfs
        .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
        .join('\n');

      const subscriptionLine = job.subscriptionUntil
        ? `🗓️ Inscrições até: ${formatDate(job.subscriptionUntil)}\n`
        : '';

      return (
        `*${index + 1}. ${job.title}*\n` +
        subscriptionLine +
        `🔗 ${job.link}\n` +
        `${pdfLines}\n` +
        `${formatVagasSummary(job)}\n`
      );
    })
    .join('\n');
}

export function formatJobVagaLines(jobs: ActiveJob[]) {
  return jobs
    .map(
      (job, index) =>
        `*${index + 1}. ${job.title}*\n` +
        `🔗 ${job.link}\n` +
        `${formatVagasSummary(job)}\n`,
    )
    .join('\n');
}

// Uma vaga por item, na ordem recebida (do mais para o menos compatível).
// Vaga de edital leva o link do edital (primeiro pdf), repetido em cada
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

      return `*${index + 1}.* ${vaga.summary}\n${inscricoes}🔗 ${link}`;
    })
    .join('\n\n');
}

const FORMATTERS: Record<JobKind, (jobs: ActiveJob[]) => string> = {
  EDITAL: formatEditalLines,
  VAGA: formatJobVagaLines,
};

// Uma seção por tipo com vagas, na ordem do JOB_TYPES, já formatada pelo kind.
export function formatJobSections(jobs: ActiveJob[]) {
  return ALL_JOB_TYPES.flatMap((type) => {
    const jobsOfType = jobs.filter((job) => job.type === type);
    if (jobsOfType.length === 0) return [];

    const { kind, header } = JOB_TYPES[type];
    return [
      {
        type,
        header,
        count: jobsOfType.length,
        body: FORMATTERS[kind](jobsOfType),
      },
    ];
  });
}
