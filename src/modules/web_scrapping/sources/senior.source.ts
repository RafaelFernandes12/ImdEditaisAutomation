import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Formato, JobType } from '#generated/prisma/enums.js';
import type { VagaAttributes } from '../../jobs/dto/jobs.dto.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobSource, ListedJob, SourceWeight } from './job.source.js';
import { VagaJobPayload } from '../strategy/new-job.strategy.js';
import {
  SeniorCompany,
  SeniorJobModel,
  SeniorSearchResponse,
  SeniorVacancy,
  SeniorVacancyDetails,
  SeniorVacancyResponse,
} from '../models/senior.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';

// Rotas que os portais de talentos usam sem login: não têm documentação. A
// busca é a mesma para todas as empresas da Senior.
const API_URL =
  'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/anonymous/rest/hcm/careersmanagercandidate/queries';

// A Gentil Negócios também publica vagas das lojas fora do RN.
const STATE = 'RN';

// Cada empresa tem o próprio portal, que é onde a vaga abre.
const COMPANIES = [
  {
    id: 'fd128524-fc49-4a41-958e-613771d730d4',
    name: 'Unimed Natal',
    portal: 'https://vagasunimednatal.portaldetalentos.senior.com.br',
  },
  {
    id: 'af8cf633-17ff-4452-a734-2cd932fe67f0',
    name: 'Gentil Negócios',
    portal: 'https://gentilnegocios.portaldetalentos.senior.com.br',
  },
];

const PAGE_SIZE = 50;

// As duas somam umas 50 vagas: o teto só impede uma volta sem fim.
const MAX_PAGES = 5;

const MIN_TECH_TERMS = 1;

const MIN_PAUSE_MS = 1000;
const MAX_PAUSE_MS = 3000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Content-Type': 'application/json',
};

const FORMATO: Record<SeniorJobModel, Formato> = {
  IN_PERSON: 'PRESENCIAL',
  HYBRID: 'HIBRIDO',
  REMOTE: 'REMOTO',
};

const JOB_MODEL_LABEL: Record<SeniorJobModel, string> = {
  IN_PERSON: 'Presencial',
  HYBRID: 'Híbrido',
  REMOTE: 'Remoto',
};

export interface SeniorListedJob extends ListedJob {
  senior: SeniorVacancy;
  company: SeniorCompany;
}

// Sem findFinished: a listagem traz todas as vagas abertas das empresas, e a
// que some dela encerrou.
@Injectable()
export class SeniorSource implements JobSource<SeniorListedJob> {
  readonly name = 'senior';
  readonly types: JobType[] = ['SENIOR'];
  readonly weight: SourceWeight = [
    [
      this.types[0],
      {
        ecossytem: 40,
        escolaridade: 10,
        salary: 5,
        formato: 5,
        city: 1,
        modelo: 4,
        senioridade: 30,
        priority: 1,
      },
    ],
  ];
  constructor(
    @InjectPinoLogger(SeniorSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<SeniorListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.senior');
    const timer = log.start('batch_start', 'Buscando vagas na Senior', {
      companies: COMPANIES.map((company) => company.name),
      state: STATE,
    });

    try {
      const today = new Date().toISOString().slice(0, 10);
      const listed: SeniorListedJob[] = [];
      let pages = 0;
      let complete = false;

      for (let page = 0; page < MAX_PAGES; page++) {
        if (page > 0) await pause();
        const body = await this.search(log.child({ page }), page);
        pages = page + 1;

        for (const { vacancy, company } of body.contents) {
          const endDate = vacancy.publication?.endDate;
          if (vacancy.localization?.province !== STATE) continue;
          if (endDate && endDate < today) continue;
          listed.push({
            link: jobLink(company, vacancy),
            type: 'SENIOR',
            senior: vacancy,
            company,
          });
        }

        if (pages >= body.totalPages) {
          complete = true;
          break;
        }
      }

      // Lista incompleta faria o encerramento fechar vaga ainda aberta.
      if (!complete) {
        throw new Error(
          `Listagem da Senior com mais de ${MAX_PAGES} páginas de vagas`,
        );
      }

      timer.info('batch_done', 'Vagas da Senior obtidas', {
        pages,
        count: listed.length,
      });

      return listed;
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas da Senior', {
        err,
      });
      throw err;
    }
  }

  async fetchDetails(jobs: SeniorListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.senior');
    const timer = log.start('details.start', 'Abrindo as vagas', {
      count: jobs.length,
    });

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;

    // Vaga que falha fica fora do banco e volta a ser tentada na próxima
    // coleta.
    for (const [index, { senior, company, link }] of jobs.entries()) {
      const jobLog = log.child({ seniorId: senior.id });

      try {
        if (index > 0) await pause();
        const details = await this.getVacancy(jobLog, senior.id);
        const title = details.title.trim();
        const description = describe(details, company);
        const terms = matchedEcosystemTerms(`${title} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title, terms });
          continue;
        }

        payloads.push(this.toJob(details, link, title, description));
      } catch (err: unknown) {
        failed++;
        jobLog.warn('job.failed', 'Falha ao processar a vaga', { err });
      }
    }

    timer.info('details.done', 'Vagas da Senior lidas', {
      count: jobs.length,
      kept: payloads.length,
      failed,
      discarded,
    });

    return payloads;
  }

  private async search(
    log: ScopedLogger,
    page: number,
  ): Promise<SeniorSearchResponse> {
    const timer = log.start('list.start', 'Buscando página da listagem');

    try {
      const body = await post<Partial<SeniorSearchResponse>>(
        'searchVacancies',
        {
          page,
          size: PAGE_SIZE,
          filter: '',
          match: { companies: COMPANIES.map(({ id }) => ({ id })) },
        },
      );

      // A API é interna e pode mudar: formato inesperado é falha da fonte.
      if (!Array.isArray(body.contents) || !body.totalPages) {
        throw new Error('Resposta da API da Senior sem a lista de vagas');
      }

      timer.info('list.done', 'Página da listagem obtida', {
        count: body.contents.length,
        totalPages: body.totalPages,
      });

      return {
        totalPages: body.totalPages,
        totalElements: body.totalElements ?? body.contents.length,
        contents: body.contents,
      };
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar a página da listagem', {
        err,
      });
      throw err;
    }
  }

  private async getVacancy(
    log: ScopedLogger,
    id: string,
  ): Promise<SeniorVacancyDetails> {
    const timer = log.start('details.job_start', 'Abrindo a vaga');

    try {
      const body = await post<Partial<SeniorVacancyResponse>>(
        'findVacancyById',
        { id },
      );

      if (!body.vacancy?.title) {
        throw new Error('Resposta da API da Senior sem a vaga');
      }

      timer.info('details.job_done', 'Vaga obtida');
      return body.vacancy;
    } catch (err: unknown) {
      timer.error('details.job_failed', 'Falha ao abrir a vaga', { err });
      throw err;
    }
  }

  private toJob(
    details: SeniorVacancyDetails,
    link: string,
    title: string,
    description: string,
  ): VagaJobPayload {
    const endDate = details.publication?.endDate;
    return {
      title,
      type: 'SENIOR',
      link,
      description,
      isActive: true,
      publishedAt: details.publication?.startDate,
      // Vale até o fim do dia em Natal.
      subscriptionUntil: endDate ? `${endDate}T23:59:59-03:00` : undefined,
      attributes: toAttributes(details),
    };
  }
}

// Só entra o que a Senior informa de fato; campo ausente fica com a IA.
function toAttributes(details: SeniorVacancyDetails): Partial<VagaAttributes> {
  const attributes: Partial<VagaAttributes> = { isInternational: false };

  if (details.localization) {
    attributes.city = details.localization.city.trim();
    attributes.state = details.localization.province;
  }

  // Vaga aberta a mais de um formato fica com a IA.
  if (details.jobModel.length === 1) {
    attributes.formato = FORMATO[details.jobModel[0]];
  }

  return attributes;
}

function jobLink(company: SeniorCompany, vacancy: SeniorVacancy) {
  const portal = COMPANIES.find(({ id }) => id === company.id)?.portal;
  if (!portal) {
    throw new Error(`Empresa fora da lista da Senior: ${company.name}`);
  }
  return `${portal}/vacancy/${vacancy.id}`;
}

function describe(details: SeniorVacancyDetails, company: SeniorCompany) {
  const local = details.localization;
  const header = [
    `Empresa: ${company.name}`,
    local && `Local: ${local.city.trim()} - ${local.province}`,
    details.jobModel.length > 0 &&
      `Modalidade: ${details.jobModel.map((model) => JOB_MODEL_LABEL[model] ?? model).join(', ')}`,
    details.positions > 1 && `Vagas: ${details.positions}`,
    details.pcd && 'Vaga para pessoa com deficiência',
  ].filter(Boolean);

  return [
    ...header,
    htmlToText(details.about?.description ?? null),
    htmlToText(details.requirements?.description ?? null),
    htmlToText(details.duties?.description ?? null),
  ]
    .filter(Boolean)
    .join('\n');
}

async function post<T>(query: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/${query}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API da Senior respondeu ${response.status} em ${query}`);
  }

  return (await response.json()) as T;
}

function pause() {
  return sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}
