import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GithubIssue } from '../models/github.js';
import { JobType } from '#generated/prisma/enums.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobSource } from './job.source.js';
import { VagaJobPayload } from '../strategy/new-job.strategy.js';

type GithubJobType = Extract<JobType, 'BACKEND_GITHUB' | 'FRONTEND_GITHUB'>;

const REPOS: { repo: string; type: GithubJobType }[] = [
  { repo: 'backend-br/vagas', type: 'BACKEND_GITHUB' },
  { repo: 'frontendbr/vagas', type: 'FRONTEND_GITHUB' },
];

@Injectable()
export class GithubSource implements JobSource<VagaJobPayload> {
  readonly name = 'github';
  readonly types: JobType[] = ['BACKEND_GITHUB', 'FRONTEND_GITHUB'];
  constructor(
    @InjectPinoLogger(GithubSource.name)
    private readonly logger: PinoLogger,
  ) {}

  // Todas as issues abertas de cada repo, inclusive as já gravadas no banco.
  async list(): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.github');
    const timer = log.start(
      'batch_start',
      'Buscando vagas nos repos do GitHub',
      { repos: REPOS.map((r) => r.repo) },
    );

    try {
      const listings = await Promise.all(
        REPOS.map(async ({ repo, type }) => {
          const issues = await this.getOpenIssues(
            log.child({ repo, jobType: type }),
            repo,
          );
          return { repo, jobs: issues.map((issue) => this.toJob(issue, type)) };
        }),
      );

      timer.info('batch_done', 'Vagas do GitHub obtidas', {
        countByRepo: Object.fromEntries(
          listings.map(({ repo, jobs }) => [repo, jobs.length]),
        ),
      });

      return listings.flatMap((listing) => listing.jobs);
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do GitHub', {
        err,
      });
      throw err;
    }
  }

  // A issue já traz a descrição completa: a listagem é o próprio detalhe.
  fetchDetails(jobs: VagaJobPayload[]): Promise<VagaJobPayload[]> {
    return Promise.resolve(jobs);
  }

  // Os repos têm bem menos de 100 vagas abertas, então uma página basta.
  private async getOpenIssues(log: ScopedLogger, repo: string) {
    const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=100`;
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

      const items = (await response.json()) as GithubIssue[];
      const issues = items.filter((v) => !v.pull_request);

      if (issues.length === 0) {
        log.warn('list.empty', 'Repo retornou zero issues abertas', {
          fetchedCount: items.length,
        });
      }

      timer.info('list.done', 'Issues do repo obtidas', {
        count: issues.length,
        pullRequestCount: items.length - issues.length,
      });

      return issues;
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar as issues do repo', {
        err,
      });
      throw err;
    }
  }

  private toJob(issue: GithubIssue, type: GithubJobType): VagaJobPayload {
    return {
      title: issue.title,
      type,
      link: issue.html_url,
      description: issue.body,
      isActive: true,
    };
  }
}
