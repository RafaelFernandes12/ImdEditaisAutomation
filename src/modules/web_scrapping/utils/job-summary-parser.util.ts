export interface JobKeywords {
  vaga: string;
  palavrasChaves: string[];
}

export function extractKeywordsPerJob(summary: string): JobKeywords[] {
  const lines = summary.split(/\r?\n/);
  const jobs: JobKeywords[] = [];
  let currentVaga = '';

  for (const line of lines) {
    const vagaMatch = line.match(/^\*Vaga:\*\s*(.+)/);
    if (vagaMatch) {
      currentVaga = vagaMatch[1].trim();
      continue;
    }

    const keywordsMatch = line.match(/^\*Palavras-chaves:\*\s*(.+)/);
    if (keywordsMatch) {
      jobs.push({
        vaga: currentVaga,
        palavrasChaves: keywordsMatch[1]
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean),
      });
    }
  }

  return jobs;
}

export function extractAllKeywords(summary: string): string[] {
  return [
    ...new Set(
      extractKeywordsPerJob(summary).flatMap((job) => job.palavrasChaves),
    ),
  ];
}
