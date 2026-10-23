import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type {
  Formato,
  JobType,
  Modelo,
  Senioridade,
} from '#generated/prisma/enums.js';
import type { VagaAttributes } from '../../jobs/dto/jobs.dto.js';
import type { ActiveJob } from '../../jobs/services/jobs.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import {
  JobSource,
  JobToFinish,
  ListedJob,
  SourceWeight,
} from './job.source.js';
import { VagaJobPayload } from '../strategy/new-job.strategy.js';
import {
  SolidesJob,
  SolidesJobsResponse,
  SolidesJobType,
  SolidesOption,
} from '../models/solides.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';
import { inNatal } from '../utils/natal.util.js';

const PORTAL_URL = 'https://vagas.solides.com.br';

// Rota que a página de busca do portal usa: não tem documentação nem token.
const SEARCH_URL = `${PORTAL_URL}/api/vacancies`;

const LOCATION = 'Natal - RN';

// Acima de 25 a API responde "Failed to fetch vacancies".
const PAGE_SIZE = 25;

// A listagem vem da mais recente para a mais antiga e mantém vagas de anos
// atrás: a busca para na primeira página que passa da idade máxima.
const MAX_PAGES = 10;

const MIN_TECH_TERMS = 1;

const MAX_AGE_DAYS = 30;

const MIN_PAUSE_MS = 1000;
const MAX_PAUSE_MS = 3000;

const DAY_MS = 24 * 60 * 60 * 1000;

const FORMATO: Record<SolidesJobType, Formato> = {
  presencial: 'PRESENCIAL',
  hibrido: 'HIBRIDO',
  remoto: 'REMOTO',
};

const MODELO: Partial<Record<string, Modelo>> = {
  clt: 'CLT',
  pj: 'PJ',
  estágio: 'ESTAGIO',
  autônomo: 'FREELANCE',
};

// Especialista e Principal ficam com a IA.
const SENIORIDADE: Partial<Record<string, Senioridade>> = {
  estagiário: 'ESTAGIO',
  junior: 'JUNIOR',
  pleno: 'PLENO',
  sênior: 'SENIOR',
};

const JOB_TYPE_LABEL: Record<SolidesJobType, string> = {
  presencial: 'Presencial',
  hibrido: 'Híbrido',
  remoto: 'Remoto',
};

export interface SolidesListedJob extends ListedJob {
  solides: SolidesJob;
}

@Injectable()
export class SolidesSource implements JobSource<SolidesListedJob> {
  readonly name = 'solides';
  readonly types: JobType[] = ['SOLIDES'];
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
    @InjectPinoLogger(SolidesSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<SolidesListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.solides');
    const timer = log.start('batch_start', 'Buscando vagas na Sólides', {
      location: LOCATION,
    });

    try {
      const since = isoDay(Date.now() - MAX_AGE_DAYS * DAY_MS);
      const today = isoDay(Date.now());
      const jobs: SolidesJob[] = [];
      let pages = 0;

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (page > 1) await pause();
        const body = await this.search(log.child({ page }), page);
        pages = page;
        jobs.push(...body.data);

        const oldest = body.data.at(-1)?.createdAt;
        if (page >= body.totalPages || !oldest || oldest < since) break;
      }

      // A listagem continua mostrando a vaga depois do fim das inscrições.
      const open = jobs.filter(
        (job) =>
          job.createdAt >= since && !(job.date?.due && job.date.due < today),
      );

      timer.info('batch_done', 'Vagas da Sólides obtidas', {
        pages,
        count: jobs.length,
        openCount: open.length,
      });

      return open.map((solides) => ({
        link: jobLink(solides),
        type: 'SOLIDES',
        solides,
      }));
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas da Sólides', {
        err,
      });
      throw err;
    }
  }

  // A listagem já traz a descrição completa: não abre a página da vaga.
  fetchDetails(jobs: SolidesListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.solides');

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;

    for (const { solides } of jobs) {
      try {
        const description = describe(solides);
        const terms = matchedEcosystemTerms(`${solides.title} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title: solides.title.trim(), terms });
          continue;
        }

        // Toda vaga vem da busca de Natal.
        payloads.push(inNatal(this.toJob(solides, description)));
      } catch (err: unknown) {
        failed++;
        log.warn('job.failed', 'Falha ao processar a vaga', {
          err,
          solidesId: solides.id,
        });
      }
    }

    log.info('details.done', 'Vagas da Sólides filtradas', {
      count: jobs.length,
      kept: payloads.length,
      failed,
      discarded,
    });

    return Promise.resolve(payloads);
  }

  // Encerra no fim das inscrições, quando a vaga informa, ou pela idade: há
  // vaga com prazo para daqui a anos.
  findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const now = new Date();
    const limit = now.getTime() - MAX_AGE_DAYS * DAY_MS;
    return Promise.resolve(
      active
        .filter(
          (job) =>
            job.type === 'SOLIDES' &&
            ((job.subscriptionUntil !== null && job.subscriptionUntil < now) ||
              (job.publishedAt ?? job.created_at).getTime() < limit),
        )
        .map((job) => ({ id: job.id })),
    );
  }

  private async search(
    log: ScopedLogger,
    page: number,
  ): Promise<SolidesJobsResponse> {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({
      page: String(page),
      take: String(PAGE_SIZE),
      locations: LOCATION,
    }).toString();
    const timer = log.start('list.start', 'Buscando página da listagem', {
      url: url.toString(),
    });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API da Sólides respondeu ${response.status}`);
      }

      const body = (await response.json()) as Partial<SolidesJobsResponse> & {
        error?: string;
      };
      // Ela é interna e pode mudar: formato inesperado é falha da fonte. Erro
      // do backend dela vem com status 200 e a lista vazia.
      if (!Array.isArray(body.data) || body.error) {
        throw new Error(
          `Resposta da API da Sólides sem a lista de vagas${body.error ? `: ${body.error}` : ''}`,
        );
      }

      if (page === 1 && body.data.length === 0) {
        log.warn('list.empty', 'Listagem sem vagas — a API mudou?');
      }

      timer.info('list.done', 'Página da listagem obtida', {
        count: body.data.length,
        totalPages: body.totalPages,
      });

      return {
        count: body.count ?? body.data.length,
        currentPage: body.currentPage ?? page,
        totalPages: body.totalPages ?? page,
        data: body.data,
      };
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar a página da listagem', {
        err,
      });
      throw err;
    }
  }

  private toJob(solides: SolidesJob, description: string): VagaJobPayload {
    return {
      title: solides.title.trim(),
      type: 'SOLIDES',
      link: jobLink(solides),
      description,
      isActive: true,
      publishedAt: solides.createdAt,
      // Vale até o fim do dia em Natal.
      subscriptionUntil: solides.date?.due
        ? `${solides.date.due}T23:59:59-03:00`
        : undefined,
      attributes: this.toAttributes(solides),
    };
  }

  // Só entra o que a Sólides informa de fato; campo ausente fica com a IA.
  private toAttributes(solides: SolidesJob): Partial<VagaAttributes> {
    const attributes: Partial<VagaAttributes> = {};

    const formato = FORMATO[solides.jobType] as Formato | undefined;
    if (formato) attributes.formato = formato;

    // Vaga aberta a mais de um nível ou contrato fica com a IA.
    const senioridade = only(solides.seniority, SENIORIDADE);
    if (senioridade) attributes.senioridade = senioridade;

    const modelo =
      senioridade === 'ESTAGIO'
        ? 'ESTAGIO'
        : only(solides.recruitmentContractType, MODELO);
    if (modelo) attributes.modelo = modelo;

    const salary = shownSalary(solides);
    if (salary !== null) attributes.salary = salary;

    return attributes;
  }
}

function jobLink(solides: SolidesJob) {
  return (
    solides.publishers?.rhgestor?.redirectUrl ??
    `${PORTAL_URL}/vaga/${solides.id}`
  );
}

function only<T>(
  options: SolidesOption[] | null,
  map: Partial<Record<string, T>>,
): T | undefined {
  if (options?.length !== 1) return undefined;
  return map[options[0].name.trim().toLowerCase()];
}

// Faixa vale pelo menor valor, como a IA faz.
function shownSalary({ salary }: SolidesJob): number | null {
  if (!salary?.showRangeToApplicant) return null;
  const value = salary.initialRange || salary.finalRange;
  return value && value > 0 ? value : null;
}

function describe(solides: SolidesJob) {
  const salary = shownSalary(solides);
  const names = (options: SolidesOption[] | null) =>
    (options ?? []).map((option) => option.name.trim()).join(', ');

  const header = [
    `Empresa: ${solides.companyName}`,
    solides.city &&
      `Local: ${solides.city.name}${solides.state?.code ? ` - ${solides.state.code}` : ''}`,
    `Modalidade: ${JOB_TYPE_LABEL[solides.jobType] ?? solides.jobType}`,
    names(solides.recruitmentContractType) &&
      `Contrato: ${names(solides.recruitmentContractType)}`,
    names(solides.seniority) && `Senioridade: ${names(solides.seniority)}`,
    salary !== null && `Salário: R$ ${salary}`,
  ].filter(Boolean);

  const skills = names(solides.hardSkills);

  return [
    ...header,
    htmlToText(solides.description),
    skills && `Conhecimentos: ${skills}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function pause() {
  return sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}
