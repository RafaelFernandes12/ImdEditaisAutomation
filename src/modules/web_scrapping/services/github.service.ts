import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GithubIssue } from '../models/github.js';
import { JobType } from '#generated/prisma/enums.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

type GithubJobType = Extract<JobType, 'BACKEND_GITHUB' | 'FRONTEND_GITHUB'>;

const REPOS: { repo: string; type: GithubJobType }[] = [
  { repo: 'backend-br/vagas', type: 'BACKEND_GITHUB' },
  { repo: 'frontendbr/vagas', type: 'FRONTEND_GITHUB' },
];

@Injectable()
export class GithubService {
  constructor(
    @InjectPinoLogger(GithubService.name)
    private readonly logger: PinoLogger,
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
      const results = await Promise.all(
        REPOS.map(({ repo, type }) =>
          this.getOpenIssues(log.child({ repo, jobType: type }), repo),
        ),
      );

      const toJob = (issue: GithubIssue, type: GithubJobType) => ({
        title: issue.title,
        type: type,
        link: issue.html_url,
        vaga: { description: issue.body },
        isActive: true,
      });

      const issues = REPOS.flatMap(({ type }, i) =>
        results[i].map((v) => toJob(v, type)),
      );

      timer.info('batch_done', 'Vagas do GitHub obtidas', {
        count: issues.length,
        countByRepo: Object.fromEntries(
          REPOS.map(({ repo }, i) => [repo, results[i].length]),
        ),
      });

      return issues;
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do GitHub', {
        err,
      });
      throw err;
    }
  }

  private async getOpenIssues(log: ScopedLogger, repo: string) {
    const url = `https://api.github.com/repos/${repo}/issues`;
    const timer = log.start('list.start', 'Buscando issues do repo', { url });

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
          Accept: 'application/vnd.github+json',
        },
      });

      if (!response.ok) {
        log.warn(
          'list.http_not_ok',
          'API do GitHub respondeu com status inesperado',
          {
            status: response.status,
            rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
          },
        );
      }

      const issues = (await response.json()) as GithubIssue[];
      const openIssues = issues.filter((v) => v.state === 'open');

      if (openIssues.length === 0) {
        log.warn('list.empty', 'Repo retornou zero issues abertas', {
          fetchedCount: issues.length,
        });
      }

      timer.info('list.done', 'Issues do repo obtidas', {
        count: openIssues.length,
        fetchedCount: issues.length,
      });

      return openIssues;
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar as issues do repo', {
        err,
      });
      throw err;
    }
  }
}
