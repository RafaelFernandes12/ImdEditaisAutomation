import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
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
import { InfojobsCard, InfojobsJobPage } from '../models/infojobs.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';
import { inNatal } from '../utils/natal.util.js';
import { UFS } from '../utils/uf.util.js';

const BASE_URL = 'https://www.infojobs.com.br';

const SEARCH_PARAMS = {
  categoria: '74',
  campo: 'griddate',
  orden: 'desc',
  Antiguedad: '1',
};

// idw: 1 presencial, 2 home office, 3 híbrido.
const SEARCHES = [
  {
    name: 'natal',
    path: '/vagas-de-emprego-desenvolvedor-em-natal,-rn.aspx',
    idw: '1,3',
    workplaces: ['Presencial', 'Híbrido'],
    uf: 'RN',
    natal: true,
  },
  // {
  //   name: 'remoto',
  //   path: '/vagas-de-emprego-desenvolvedor.aspx',
  //   idw: '2',
  //   workplaces: ['Home office'],
  //   uf: null,
  //   natal: false,
  // },
];

const MIN_TECH_TERMS = 2;

const MAX_AGE_DAYS = 15;

const MIN_PAUSE_MS = 1000;
const MAX_PAUSE_MS = 3000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const FORMATO: Partial<Record<string, Formato>> = {
  Presencial: 'PRESENCIAL',
  Híbrido: 'HIBRIDO',
  'Home office': 'REMOTO',
};

const MODELO: Partial<Record<string, Modelo>> = {
  'Efetivo – CLT': 'CLT',
  'Prestador de Serviços (PJ)': 'PJ',
  Estágio: 'ESTAGIO',
  Autônomo: 'FREELANCE',
};

const SENIORIDADE: Partial<Record<string, Senioridade>> = {
  Estagiário: 'ESTAGIO',
  Trainee: 'TRAINEE',
};

export interface InfojobsListedJob extends ListedJob {
  infojobs: InfojobsCard;
  // Achada na busca de Natal.
  natal: boolean;
}

@Injectable()
export class InfojobsSource implements JobSource<InfojobsListedJob> {
  readonly name = 'infojobs';
  readonly types: JobType[] = ['INFOJOBS'];
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
    @InjectPinoLogger(InfojobsSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<InfojobsListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.infojobs');
    const timer = log.start('batch_start', 'Buscando vagas no InfoJobs', {
      searches: SEARCHES.map((search) => search.name),
    });

    try {
      const byId = new Map<string, InfojobsCard>();
      const natalIds = new Set<string>();
      const countBySearch: Record<string, number> = {};

      for (const [index, search] of SEARCHES.entries()) {
        if (index > 0) await pause();
        const cards = await this.search(
          log.child({ search: search.name }),
          search,
        );
        countBySearch[search.name] = cards.length;
        for (const card of cards) {
          byId.set(card.id, card);
          if (search.natal) natalIds.add(card.id);
        }
      }

      timer.info('batch_done', 'Vagas do InfoJobs obtidas', {
        countBySearch,
        uniqueCount: byId.size,
      });

      return [...byId.values()].map((infojobs) => ({
        link: jobLink(infojobs.path),
        type: 'INFOJOBS',
        infojobs,
        natal: natalIds.has(infojobs.id),
      }));
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do InfoJobs', {
        err,
      });
      throw err;
    }
  }

  async fetchDetails(jobs: InfojobsListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.infojobs');
    const timer = log.start('details.start', 'Abrindo as páginas das vagas', {
      count: jobs.length,
    });

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;

    // Vaga que falha fica fora do banco e volta a ser tentada na próxima
    // coleta.
    for (const [index, { infojobs, natal }] of jobs.entries()) {
      const jobLog = log.child({ infojobsId: infojobs.id });

      try {
        if (index > 0) await pause();
        const page = await this.getJobPage(jobLog, jobLink(infojobs.path));

        if (!page) {
          failed++;
          continue;
        }

        const description = describe(infojobs, page);
        const terms = matchedEcosystemTerms(`${infojobs.title} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title: infojobs.title, terms });
          continue;
        }

        const job = this.toJob(infojobs, page, description);
        payloads.push(natal ? inNatal(job) : job);
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

  findFinished(active: ActiveJob[]): Promise<JobToFinish[]> {
    const limit = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return Promise.resolve(
      active
        .filter(
          (job) =>
            job.type === 'INFOJOBS' &&
            (job.publishedAt ?? job.created_at).getTime() < limit,
        )
        .map((job) => ({ id: job.id })),
    );
  }

  private async search(
    log: ScopedLogger,
    search: (typeof SEARCHES)[number],
  ): Promise<InfojobsCard[]> {
    const url = new URL(search.path, BASE_URL);
    url.search = new URLSearchParams({
      ...SEARCH_PARAMS,
      idw: search.idw,
    }).toString();
    const timer = log.start('list.start', 'Buscando página da listagem', {
      url: url.toString(),
    });

    try {
      const response = await fetch(url, { headers: HEADERS });

      if (!response.ok) {
        throw new Error(`Busca do InfoJobs respondeu ${response.status}`);
      }

      const listed = parseCards(await response.text());

      if (listed.length === 0) {
        log.warn('list.empty', 'Listagem sem cards — HTML do site mudou?');
      }

      const cards = listed.filter(
        (card) =>
          card.workplace !== null &&
          search.workplaces.includes(card.workplace) &&
          (search.uf === null || card.location.endsWith(` - ${search.uf}`)),
      );

      timer.info('list.done', 'Página da listagem obtida', {
        count: cards.length,
        outOfSearch: listed.length - cards.length,
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
    link: string,
  ): Promise<InfojobsJobPage | null> {
    const response = await fetch(link, { headers: HEADERS });

    if (!response.ok) {
      log.warn(
        'job_page.http_not_ok',
        'Página da vaga respondeu com status inesperado',
        { status: response.status },
      );
      return null;
    }

    const $ = cheerio.load(await response.text());
    const panel = $('.js_vacancyDataPanels').first();
    const text = panel.find('.white-space-pre-line').first();

    // Vaga encerrada cai na home do site, sem o painel da vaga.
    if (text.length === 0) {
      log.warn('job_page.no_data', 'Página da vaga sem a descrição');
      return null;
    }

    // Antes do texto ficam os números de inscritos, só para assinantes.
    text.prevAll().remove();
    panel.find('.promo-cw, #lnkReportVacancy').remove();

    // "Tipo de contrato e Jornada: Estágio - Parcial manhãs".
    const fields: Record<string, string> = {};
    panel.children('p').each((_, p) => {
      const label = $(p).children('span.font-weight-bold').first();
      if (label.length === 0) return;
      fields[label.text().replace(/:\s*$/, '').trim()] = $(p)
        .text()
        .slice(label.text().length)
        .trim();
    });

    return {
      descriptionHtml: panel.html() ?? '',
      contract: fields['Tipo de contrato e Jornada']?.split(' - ')[0] ?? null,
      level: fields['Área Profissional']?.split(' em ')[0] ?? null,
      salary: jsonLdSalary($),
    };
  }

  private toJob(
    infojobs: InfojobsCard,
    page: InfojobsJobPage,
    description: string,
  ): VagaJobPayload {
    return {
      title: infojobs.title,
      type: 'INFOJOBS',
      link: jobLink(infojobs.path),
      description,
      isActive: true,
      publishedAt: infojobs.postedAt ?? undefined,
      attributes: this.toAttributes(infojobs, page),
    };
  }

  // Só entra o que o InfoJobs informa de fato; campo ausente fica com a IA.
  private toAttributes(
    infojobs: InfojobsCard,
    page: InfojobsJobPage,
  ): Partial<VagaAttributes> {
    const attributes: Partial<VagaAttributes> = {};

    const formato = FORMATO[infojobs.workplace ?? ''];
    if (formato) attributes.formato = formato;

    const senioridade = SENIORIDADE[page.level ?? ''];
    if (senioridade) attributes.senioridade = senioridade;

    // Estágio às vezes vem com o contrato "Efetivo – CLT": o nível vale mais.
    const modelo =
      senioridade === 'ESTAGIO' ? 'ESTAGIO' : MODELO[page.contract ?? ''];
    if (modelo) attributes.modelo = modelo;

    if (page.salary !== null) attributes.salary = page.salary;

    // "Todo Brasil" não tem o hífen: fica com a IA.
    const [city, region] = infojobs.location.split(' - ').map((s) => s.trim());
    if (region && UFS.has(region)) {
      attributes.city = city;
      attributes.state = region;
    }

    return attributes;
  }
}

function jobLink(path: string) {
  return new URL(path, BASE_URL).href;
}

// O salário e o local ficam no topo da página, fora do painel: entram no
// texto para a IA quando a página não tem o JSON-LD.
function describe(infojobs: InfojobsCard, page: InfojobsJobPage) {
  const header = [
    infojobs.location && `Local: ${infojobs.location}`,
    infojobs.workplace && `Regime de trabalho: ${infojobs.workplace}`,
    infojobs.salary && `Salário: ${infojobs.salary}`,
  ].filter(Boolean);
  return [...header, htmlToText(page.descriptionHtml)].join('\n');
}

// Só salário mensal em reais; faixa vale pelo menor valor, como a IA faz.
function jsonLdSalary($: cheerio.CheerioAPI): number | null {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(script).text()) as {
        '@type'?: string;
        baseSalary?: {
          currency?: string;
          value?: { unitText?: string; minValue?: number };
        };
      };
      if (data['@type'] !== 'JobPosting') continue;

      const salary = data.baseSalary;
      if (
        salary?.currency === 'BRL' &&
        salary.value?.unitText === 'MONTH' &&
        typeof salary.value.minValue === 'number'
      ) {
        return salary.value.minValue;
      }
      return null;
    } catch {
      continue;
    }
  }
  return null;
}

function parseCards(html: string): InfojobsCard[] {
  const $ = cheerio.load(html);
  return $('.js_vacancyLoad[data-id][data-href]')
    .toArray()
    .map((card) => {
      const items = $(card)
        .find('.d-inline-flex > div')
        .toArray()
        .map((item) => ({
          text: $(item).text().replace(/\s+/g, ' ').trim(),
          money: $(item).find('.icon-money').length > 0,
        }));

      // A data vem com a hora em 12h sem AM/PM ("2026/10/21 05:49:00" para
      // 17:49): só o dia é confiável.
      const date = $(card).find('.js_date').attr('data-value');

      // Texto solto: "Natal - RN" seguido da distância até o candidato.
      const location = $(card)
        .children('.mb-8')
        .first()
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();

      return {
        id: $(card).attr('data-id')!,
        title: $(card)
          .find('.js_vacancyTitle')
          .text()
          .replace(/\s+/g, ' ')
          .trim(),
        path: $(card).attr('data-href')!,
        location,
        postedAt: date?.slice(0, 10).replaceAll('/', '-') ?? null,
        workplace: items.find((item) => FORMATO[item.text])?.text ?? null,
        salary: items.find((item) => item.money)?.text ?? null,
      };
    });
}

function pause() {
  return sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}
