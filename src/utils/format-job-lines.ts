import type { ActiveJob } from '../modules/jobs/services/jobs.service.js';
import {
  ALL_JOB_TYPES,
  JOB_TYPES,
  JobKind,
} from '../modules/jobs/job-types.js';
import { formatDate } from './formate-date.js';

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
        `${job.summary}\n`
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
        `${job.summary}\n`,
    )
    .join('\n');
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
