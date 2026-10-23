import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as cheerio from 'cheerio';
import type { JobType, Modelo, Senioridade } from '#generated/prisma/enums.js';
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
import { LinkedinCard, LinkedinJobPage } from '../models/linkedin.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';
import { inNatal } from '../utils/natal.util.js';
import { UFS } from '../utils/uf.util.js';

// Rotas que a página pública de vagas usa sem login.
const SEARCH_URL =
  'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const JOB_PAGE_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';

const BRASIL_PARAMS = {
  keywords:
    'vagas de desenvolvedor júnior, estágio ou trainee em backend, frontend, fullstack node java python javascript typescript react',
  location: 'Brasil',
  geoId: '106057199',
  f_TPR: 'r10800',
  // Mais recentes primeiro.
  sortBy: 'DD',
};

// Em Natal a frase acima quase não acha vaga (1 na semana): ali vale qualquer
// vaga de desenvolvedor da última semana, e o ranking separa a senioridade.
const NATAL_PARAMS = {
  keywords: 'desenvolvedor',
  location: 'Natal, Rio Grande do Norte, Brasil',
  f_TPR: 'r604800',
  sortBy: 'DD',
};

const SEARCHES = [
  { name: 'brasil', params: BRASIL_PARAMS, natal: false },
  { name: 'natal', params: NATAL_PARAMS, natal: true },
];

const PAGE_SIZE = 10;

const MAX_PAGES = 1;

const MIN_TECH_TERMS = 2;

const MAX_AGE_DAYS = 7;

const MIN_PAUSE_MS = 1000;
const MAX_PAUSE_MS = 3000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const TOO_MANY_REQUESTS = 429;
const BLOCKED = 999;
const RETRY_DELAYS_MS = [10_000, 30_000];

const SENIORIDADE: Partial<Record<string, Senioridade>> = {
  Estágio: 'ESTAGIO',
};

const MODELO: Partial<Record<string, Modelo>> = {
  Estágio: 'ESTAGIO',
};

export interface LinkedinListedJob extends ListedJob {
  linkedin: LinkedinCard;
  // Achada na busca de Natal.
  natal: boolean;
}

class LinkedinBlockedError extends Error {
  constructor(readonly status: number) {
    super(`LinkedIn bloqueou a requisição (${status})`);
  }
}

@Injectable()
export class LinkedinSource implements JobSource<LinkedinListedJob> {
  readonly name = 'linkedin';
  readonly types: JobType[] = ['LINKEDIN'];
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
    @InjectPinoLogger(LinkedinSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<LinkedinListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.linkedin');
    const timer = log.start('batch_start', 'Buscando vagas no LinkedIn', {
      searches: SEARCHES,
    });

    try {
      const byId = new Map<string, LinkedinCard>();
      const natalIds = new Set<string>();
      const countBySearch: Record<string, number> = {};
      let requests = 0;

      // Uma página por vez. Bloqueio no meio fica com as páginas já lidas: as
      // vagas mais recentes vêm primeiro e o resto entra na próxima coleta.
      searches: for (const search of SEARCHES) {
        const searchLog = log.child({ search: search.name });
        countBySearch[search.name] = 0;

        for (let page = 0; page < MAX_PAGES; page++) {
          if (requests++ > 0) await pause();

          let cards: LinkedinCard[];
          try {
            cards = await this.searchPage(
              searchLog,
              search.params,
              page * PAGE_SIZE,
            );
          } catch (err: unknown) {
            if (!(err instanceof LinkedinBlockedError) || byId.size === 0) {
              throw err;
            }
            searchLog.warn(
              'list.partial',
              'LinkedIn bloqueou — seguindo com o lido',
              { status: err.status, pagesRead: page },
            );
            break searches;
          }

          countBySearch[search.name] += cards.length;
          for (const card of cards) {
            byId.set(card.id, card);
            if (search.natal) natalIds.add(card.id);
          }
          // Página incompleta é a última.
          if (cards.length < PAGE_SIZE) break;
        }
      }

      timer.info('batch_done', 'Vagas do LinkedIn obtidas', {
        countBySearch,
        count: byId.size,
      });

      return [...byId.values()].map((linkedin) => ({
        link: jobLink(linkedin.id),
        type: 'LINKEDIN',
        linkedin,
        natal: natalIds.has(linkedin.id),
      }));
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do LinkedIn', {
        err,
      });
      throw err;
    }
  }

  // Chega só vaga ainda não gravada. O card não tem a descrição, que decide se
  // a vaga é de tecnologia: ela está na página da vaga.
  async fetchDetails(jobs: LinkedinListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.linkedin');
    const timer = log.start('details.start', 'Abrindo as páginas das vagas', {
      count: jobs.length,
    });

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;
    let blocked = false;

    // Vaga que falha fica fora do banco e volta a ser tentada na próxima
    // coleta. No bloqueio para de vez: o resto também fica para a próxima.
    for (const [index, { linkedin, natal }] of jobs.entries()) {
      const jobLog = log.child({ linkedinId: linkedin.id });

      try {
        if (index > 0) await pause();
        const page = await this.getJobPage(jobLog, linkedin.id);

        if (!page) {
          failed++;
          continue;
        }

        const description = htmlToText(page.descriptionHtml);
        const terms = matchedEcosystemTerms(`${linkedin.title} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title: linkedin.title, terms });
          continue;
        }

        const job = this.toJob(linkedin, page, description);
        payloads.push(natal ? inNatal(job) : job);
      } catch (err: unknown) {
        if (err instanceof LinkedinBlockedError) {
          blocked = true;
          jobLog.warn(
            'details.blocked',
            'LinkedIn bloqueou — o resto fica para a próxima coleta',
            { status: err.status, remaining: jobs.length - index },
          );
          break;
        }
        failed++;
        jobLog.warn('job.failed', 'Falha ao processar a vaga', { err });
      }
    }

    timer.info('details.done', 'Páginas das vagas lidas', {
      count: jobs.length,
      kept: payloads.length,
      failed,
      blocked,
      discarded,
    });

    return payloads;
  }

  // Encerrar pela idade: a página pública não traz o prazo de inscrição, e
  // abrir a página de cada vaga ativa a cada coleta pediria um bloqueio.
  findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const limit = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return Promise.resolve(
      active
        .filter(
          (job) =>
            job.type === 'LINKEDIN' &&
            (job.publishedAt ?? job.created_at).getTime() < limit,
        )
        .map((job) => ({ id: job.id })),
    );
  }

  private async request(log: ScopedLogger, url: string) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: HEADERS });

      if (response.status === BLOCKED) {
        throw new LinkedinBlockedError(response.status);
      }

      if (response.status !== TOO_MANY_REQUESTS) return response;

      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw new LinkedinBlockedError(response.status);

      log.warn('request.throttled', 'LinkedIn pediu calma — tentando de novo', {
        url,
        attempt: attempt + 1,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  private async searchPage(
    log: ScopedLogger,
    params: Record<string, string>,
    start: number,
  ) {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({
      ...params,
      start: String(start),
    }).toString();
    const timer = log.start('list.start', 'Buscando página da listagem', {
      url: url.toString(),
    });

    try {
      const response = await this.request(log, url.toString());

      if (!response.ok) {
        throw new Error(`Busca do LinkedIn respondeu ${response.status}`);
      }

      const cards = parseCards(await response.text());

      timer.info('list.done', 'Página da listagem obtida', {
        count: cards.length,
      });

      return cards;
    } catch (err: unknown) {
      timer.error('list.failed', 'Falha ao buscar a página da listagem', {
        err,
      });
      throw err;
    }
  }

  private async getJobPage(
    log: ScopedLogger,
    id: string,
  ): Promise<LinkedinJobPage | null> {
    const response = await this.request(log, `${JOB_PAGE_URL}/${id}`);

    if (!response.ok) {
      log.warn(
        'job_page.http_not_ok',
        'Página da vaga respondeu com status inesperado',
        { status: response.status },
      );
      return null;
    }

    const $ = cheerio.load(await response.text());
    const descriptionHtml = $('.show-more-less-html__markup').html();

    if (!descriptionHtml) {
      log.warn('job_page.no_data', 'Página da vaga sem a descrição');
      return null;
    }

    const criteria: Record<string, string> = {};
    $('.description__job-criteria-item').each((_, item) => {
      const label = $(item)
        .find('.description__job-criteria-subheader')
        .text()
        .trim();
      criteria[label] = $(item)
        .find('.description__job-criteria-text')
        .text()
        .trim();
    });

    return { descriptionHtml, criteria };
  }

  private toJob(
    linkedin: LinkedinCard,
    page: LinkedinJobPage,
    description: string,
  ): VagaJobPayload {
    return {
      title: linkedin.title,
      type: 'LINKEDIN',
      link: jobLink(linkedin.id),
      description,
      isActive: true,
      publishedAt: linkedin.postedAt ?? undefined,
      attributes: this.toAttributes(linkedin, page),
    };
  }

  // Só entra o que o LinkedIn informa de fato; campo ausente fica com a IA.
  // Remoto, híbrido ou presencial a página pública não diz: só o texto.
  private toAttributes(
    linkedin: LinkedinCard,
    page: LinkedinJobPage,
  ): Partial<VagaAttributes> {
    const attributes: Partial<VagaAttributes> = {};

    const senioridade = SENIORIDADE[page.criteria['Nível de experiência']];
    if (senioridade) attributes.senioridade = senioridade;

    const modelo = MODELO[page.criteria['Tipo de emprego']];
    if (modelo) attributes.modelo = modelo;

    // "São Paulo e Região" e "Brasil" não têm vírgula: ficam com a IA.
    const [city, region] = linkedin.location.split(',').map((s) => s.trim());
    if (region) {
      attributes.city = city;
      if (UFS.has(region)) attributes.state = region;
    }

    return attributes;
  }
}

// Sem os parâmetros de rastreio, para o mesmo link casar entre coletas.
function jobLink(id: string) {
  return `https://www.linkedin.com/jobs/view/${id}/`;
}

function parseCards(html: string): LinkedinCard[] {
  const $ = cheerio.load(html);
  return $('[data-entity-urn^="urn:li:jobPosting:"]')
    .toArray()
    .map((card) => ({
      id: $(card).attr('data-entity-urn')!.split(':').pop()!,
      title: $(card)
        .find('.base-search-card__title')
        .text()
        .replace(/\s+/g, ' ')
        .trim(),
      location: $(card).find('.job-search-card__location').text().trim(),
      postedAt: $(card).find('time[datetime]').attr('datetime') ?? null,
    }));
}

function pause() {
  return sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}
