import type { ActiveJob } from '../modules/jobs/services/jobs.service.js';
import { formatDate } from './formate-date.js';

export function formatEditalLines(editais: ActiveJob[]) {
  return editais
    .map((job, index) => {
      const pdfLines = (job.edital?.pdfs ?? [])
        .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
        .join('\n');

      const subscriptionLine = job.edital
        ? `🗓️ Inscrições até: ${formatDate(job.edital.subscriptionUntil)}\n`
        : '';

      return (
        `*${index + 1}. ${job.title}*\n` +
        subscriptionLine +
        `🔗 ${job.link}\n` +
        `${pdfLines}\n` +
        `${job.summary}`
      );
    })
    .join('\n');
}

export function formatJerimumLines(jobs: ActiveJob[]) {
  return jobs
    .map(
      (job, index) =>
        `*${index + 1}. ${job.title}*\n` +
        `🔗 ${job.link}\n` +
        `${job.summary}`,
    )
    .join('\n');
}
