import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { GithubIssue } from '../models/github.js';
import { JobType } from '#generated/prisma/enums.js';

@Injectable()
export class GithubService {
  constructor(
    @InjectPinoLogger(GithubService.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute() {
    const [githubIssuesBackend, githubIssuesFrontend] = await Promise.all([
      fetch('https://api.github.com/repos/backend-br/vagas/issues', {
        headers: {
          Authorization: 'Bearer' + process.env.GITHUB_TOKEN,
          Accept: 'application/vnd.github+json',
        },
      }),

      fetch('https://api.github.com/repos/frontendbr/vagas/issues', {
        headers: {
          Authorization: 'Bearer' + process.env.GITHUB_TOKEN,
          Accept: 'application/vnd.github+json',
        },
      }),
    ]);
    const githubIssuesBackendJson =
      (await githubIssuesBackend.json()) as GithubIssue[];

    const githubIssuesFrontendJson =
      (await githubIssuesFrontend.json()) as GithubIssue[];
    const toJob = (issue: GithubIssue, type: JobType) => ({
      title: issue.title,
      type: type,
      link: issue.url,
      jerimum: { description: issue.body },
      isActive: true,
    });

    const issues = [
      ...githubIssuesBackendJson,
      ...githubIssuesFrontendJson,
    ].filter((v) => v.state === 'open');
    const openIssues = [
      ...issues.map((v) => toJob(v, 'BACKEND_GITHUB')),
      ...issues.map((v) => toJob(v, 'FRONTEND_GITHUB')),
    ];
    return openIssues;
  }
}
