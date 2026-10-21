import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
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
  GupyJob,
  GupyJobPage,
  GupyJobsResponse,
  GupyJobType,
  GupyWorkplaceType,
} from '../models/gupy.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';
import { UFS } from '../utils/uf.util.js';

const SEARCH_URL = 'https://portal.gupy.io/api/job-search/jobs';

const SEARCH_TERMS = ['desenvolvedor', 'developer', 'software'];

const PAGE_SIZE = 100;

const MIN_TECH_TERMS = 2;

const PAGE_SECTIONS = [
  ['description', null],
  ['responsibilities', 'Responsabilidades e atribuições'],
  ['prerequisites', 'Requisitos e qualificações'],
  ['relevantExperiences', 'Informações adicionais'],
] as const satisfies readonly (readonly [keyof GupyJobPage, string | null])[];

const FORMATO: Record<GupyWorkplaceType, Formato> = {
  remote: 'REMOTO',
  hybrid: 'HIBRIDO',
  'on-site': 'PRESENCIAL',
};

const MODELO: Partial<Record<GupyJobType, Modelo>> = {
  vacancy_type_effective: 'CLT',
  vacancy_type_internship: 'ESTAGIO',
  vacancy_legal_entity: 'PJ',
  vacancy_type_freelancer: 'FREELANCE',
};

const SENIORIDADE: Partial<Record<GupyJobType, Senioridade>> = {
  vacancy_type_internship: 'ESTAGIO',
  vacancy_type_trainee: 'TRAINEE',
};

export interface GupyListedJob extends ListedJob {
  gupy: GupyJob;
}

@Injectable()
export class GupySource implements JobSource<GupyListedJob> {
  readonly name = 'gupy';
  readonly types: JobType[] = ['GUPY'];
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
    @InjectPinoLogger(GupySource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<GupyListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.gupy');
    const timer = log.start('batch_start', 'Buscando vagas na Gupy', {
      terms: SEARCH_TERMS,
    });

    try {
      const byId = new Map<number, GupyJob>();
      const countByTerm: Record<string, number> = {};

      // Uma requisição por vez para não martelar a API do portal.
      for (const term of SEARCH_TERMS) {
        const jobs = await this.search(log.child({ term }), term);
        countByTerm[term] = jobs.length;
        for (const job of jobs) byId.set(job.id, job);
      }

      // O portal também lista vagas de outros sites (vaga-ja.com), cuja página
      // não tem os dados da vaga no formato da Gupy.
      const hosted = [...byId.values()].filter((gupy) =>
        isGupyPage(gupy.jobUrl),
      );

      timer.info('batch_done', 'Vagas da Gupy obtidas', {
        countByTerm,
        uniqueCount: byId.size,
        externalCount: byId.size - hosted.length,
      });

      return hosted.map((gupy) => ({
        link: gupy.jobUrl,
        type: 'GUPY',
        gupy,
      }));
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas da Gupy', {
        err,
      });
      throw err;
    }
  }

  // Chega só vaga ainda não gravada. A descrição da listagem é um resumo: o
  // texto completo, que decide se a vaga é de tecnologia, está na página.
  async fetchDetails(jobs: GupyListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.gupy');
    const timer = log.start('details.start', 'Abrindo as páginas das vagas', {
      count: jobs.length,
    });

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;

    // Uma página por vez, como na listagem. Vaga que falha fica fora do banco
    // e volta a ser tentada na próxima coleta, sem derrubar as outras.
    for (const { gupy } of jobs) {
      const jobLog = log.child({ gupyId: gupy.id, link: gupy.jobUrl });

      try {
        const page = await this.getJobPage(jobLog, gupy.jobUrl);

        if (!page) {
          failed++;
          continue;
        }

        const description = pageText(page);
        const terms = matchedEcosystemTerms(`${gupy.name} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title: gupy.name.trim(), terms });
          continue;
        }

        payloads.push(this.toJob(gupy, page, description));
      } catch (err: unknown) {
        failed++;
        jobLog.warn('job.failed', 'Falha ao processar a vaga', { err });
      }
    }

    timer.info('details.done', 'Páginas das vagas lidas', {
      count: jobs.length,
      kept: payloads.length,
      failed,
      discarded,
    });

    return payloads;
  }

  // A listagem só traz as vagas recentes, então sumir dela não quer dizer
  // nada: a vaga encerra quando passa o prazo de inscrição que a Gupy informa.
  findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const now = new Date();
    return Promise.resolve(
      active
        .filter(
          (job) =>
            job.type === 'GUPY' &&
            job.subscriptionUntil !== null &&
            job.subscriptionUntil < now,
        )
        .map((job) => ({ id: job.id })),
    );
  }

  private async search(log: ScopedLogger, term: string) {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({
      jobName: term,
      limit: String(PAGE_SIZE),
      offset: '0',
      sortBy: 'publishedDate',
      sortOrder: 'desc',
    }).toString();
    const timer = log.start('list.start', 'Buscando vagas do termo', {
      url: url.toString(),
    });

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`API da Gupy respondeu ${response.status}`);
      }

      const body = (await response.json()) as Partial<GupyJobsResponse>;
      // Ela é interna e pode mudar: formato inesperado é falha da fonte.
      if (!Array.isArray(body.data)) {
        throw new Error('Resposta da API da Gupy sem a lista de vagas');
      }

      if (body.data.length === 0) {
        log.warn('list.empty', 'Termo retornou zero vagas');
      }

      timer.info('list.done', 'Vagas do termo obtidas', {
        count: body.data.length,
      });

      return body.data;
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar as vagas do termo', { err });
      throw err;
    }
  }

  // A página é Next.js: os dados da vaga vêm no JSON do __NEXT_DATA__.
  private async getJobPage(
    log: ScopedLogger,
    link: string,
  ): Promise<GupyJobPage | null> {
    try {
      const response = await fetch(link);

      if (!response.ok) {
        log.warn(
          'job_page.http_not_ok',
          'Página da vaga respondeu com status inesperado',
          { status: response.status },
        );
        return null;
      }

      const $ = cheerio.load(await response.text());
      const nextData = JSON.parse($('#__NEXT_DATA__').text() || 'null') as {
        props?: { pageProps?: { job?: GupyJobPage } };
      } | null;
      const page = nextData?.props?.pageProps?.job;

      if (!page) {
        log.warn('job_page.no_data', 'Página da vaga sem os dados da vaga');
        return null;
      }

      if (page.status !== 'published') {
        log.info('job_page.not_published', 'Vaga não está mais publicada', {
          status: page.status,
        });
        return null;
      }

      return page;
    } catch (err: unknown) {
      log.warn('job_page.failed', 'Falha ao abrir a página da vaga', { err });
      return null;
    }
  }

  private toJob(
    gupy: GupyJob,
    page: GupyJobPage,
    description: string,
  ): VagaJobPayload {
    return {
      title: gupy.name.trim(),
      type: 'GUPY',
      link: gupy.jobUrl,
      description,
      isActive: true,
      publishedAt: gupy.publishedDate,
      subscriptionUntil: gupy.applicationDeadline ?? undefined,
      attributes: this.toAttributes(gupy, page),
    };
  }

  // Só entra o que a Gupy informa de fato; campo ausente fica com a IA.
  private toAttributes(
    gupy: GupyJob,
    page: GupyJobPage,
  ): Partial<VagaAttributes> {
    const attributes: Partial<VagaAttributes> = {};

    const formato = FORMATO[gupy.workplaceType] as Formato | undefined;
    if (formato) attributes.formato = formato;

    const modelo = MODELO[gupy.type];
    if (modelo) attributes.modelo = modelo;

    const senioridade = SENIORIDADE[gupy.type];
    if (senioridade) attributes.senioridade = senioridade;

    // Remota vem com cidade e estado vazios.
    if (page.addressCity) attributes.city = page.addressCity;

    const country = page.addressCountryShortName?.trim().toUpperCase();
    if (country && country !== 'BR') {
      // O portal também anuncia vagas na Colômbia, no Chile, no México... O
      // estado delas não é UF, e o texto que a IA lê não diz o país.
      attributes.isInternational = true;
      attributes.state = null;
    } else if (UFS.has(page.addressStateShortName ?? '')) {
      attributes.state = page.addressStateShortName;
    }

    return attributes;
  }
}

function isGupyPage(link: string) {
  try {
    return new URL(link).hostname.endsWith('.gupy.io');
  } catch {
    return false;
  }
}

function pageText(page: GupyJobPage) {
  return PAGE_SECTIONS.map(([field, heading]) => {
    const text = htmlToText(page[field]);
    if (!text) return null;
    return heading ? `${heading}\n${text}` : text;
  })
    .filter((section): section is string => section !== null)
    .join('\n\n');
}
