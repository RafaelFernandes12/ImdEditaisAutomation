import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GithubIssue } from '../models/github.js';
import { JobType } from '#generated/prisma/enums.js';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

type GithubJobType = Extract<JobType, 'BACKEND_GITHUB' | 'FRONTEND_GITHUB'>;

const REPOS: { repo: string; type: GithubJobType }[] = [
  { repo: 'backend-br/vagas', type: 'BACKEND_GITHUB' },
  { repo: 'frontendbr/vagas', type: 'FRONTEND_GITHUB' },
];

const PER_PAGE = 100;
// Trava de segurança contra loop de paginação (1000 issues por repo).
const MAX_PAGES = 10;

@Injectable()
export class GithubService {
  constructor(
    @InjectPinoLogger(GithubService.name)
    private readonly logger: PinoLogger,
    private readonly jobsService: JobsService,
  ) {}

  async execute() {
    const log = new ScopedLogger(this.logger, 'scraper.github');
    const timer = log.start(
      'batch_start',
      'Buscando vagas nos repos do GitHub',
      {
        repos: REPOS.map((r) => r.repo),
      },
    );

    try {
      const listings = await this.getListedJobs(log);
      const listedJobs = listings.flatMap((listing) => listing.jobs);

      const existingJobs = await this.jobsService.findManyByLink(
        listedJobs.map((job) => job.link),
      );
      const existingLinks = new Set(existingJobs.map((j) => j.link));
      const jobs = listedJobs.filter((job) => !existingLinks.has(job.link));

      timer.info('batch_done', 'Vagas do GitHub obtidas', {
        count: jobs.length,
        listedCount: listedJobs.length,
        knownCount: listedJobs.length - jobs.length,
        countByRepo: Object.fromEntries(
          listings.map(({ repo, jobs }) => [repo, jobs.length]),
        ),
      });

      return jobs;
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do GitHub', {
        err,
      });
      throw err;
    }
  }

  // Todas as issues abertas de cada repo, inclusive as já gravadas no banco.
  async getListedJobs(log = new ScopedLogger(this.logger, 'scraper.github')) {
    return await Promise.all(
      REPOS.map(async ({ repo, type }) => {
        const { issues, truncated } = await this.getOpenIssues(
          log.child({ repo, jobType: type }),
          repo,
        );
        return {
          repo,
          type,
          truncated,
          jobs: issues.map((issue) => toJob(issue, type)),
        };
      }),
    );
  }

  private async getOpenIssues(log: ScopedLogger, repo: string) {
    const firstPageUrl = `https://api.github.com/repos/${repo}/issues?state=open&per_page=${PER_PAGE}`;
    const timer = log.start('list.start', 'Buscando issues do repo', {
      url: firstPageUrl,
    });

    try {
      const items: GithubIssue[] = [];
      let url: string | null = firstPageUrl;
      let pages = 0;

      while (url && pages < MAX_PAGES) {
        const response = await fetch(url, {
          headers: {
            Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
            Accept: 'application/vnd.github+json',
          },
        });
        pages++;

        if (!response.ok) {
          log.warn(
            'list.http_not_ok',
            'API do GitHub respondeu com status inesperado',
            {
              url,
              status: response.status,
              rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
            },
          );
        }

        items.push(...((await response.json()) as GithubIssue[]));
        url = getNextPageUrl(response.headers.get('link'));
      }

      if (url) {
        log.warn(
          'list.truncated',
          'Limite de páginas atingido — seguindo com as issues já obtidas',
          { pages, maxPages: MAX_PAGES },
        );
      }

      const issues = items.filter((v) => !v.pull_request);

      if (issues.length === 0) {
        log.warn('list.empty', 'Repo retornou zero issues abertas', {
          fetchedCount: items.length,
        });
      }

      timer.info('list.done', 'Issues do repo obtidas', {
        count: issues.length,
        pullRequestCount: items.length - issues.length,
        pages,
      });

      return { issues, truncated: url !== null };
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar as issues do repo', {
        err,
      });
      throw err;
    }
  }
}

function toJob(issue: GithubIssue, type: GithubJobType) {
  return {
    title: issue.title,
    type,
    link: issue.html_url,
    vaga: { description: issue.body },
    isActive: true,
  };
}

// Header `Link` da API do GitHub: `<url>; rel="next", <url>; rel="last"`.
function getNextPageUrl(linkHeader: string | null) {
  return linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
}
