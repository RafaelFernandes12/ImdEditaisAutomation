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
import { ScopedLogger } from '../../../utils/scoped-logger.js';
import { JobSource, ListedJob, SourceWeight } from './job.source.js';
import { VagaJobPayload } from '../strategy/new-job.strategy.js';
import { BneJob, BneJobPage } from '../models/bne.js';
import { matchedEcosystemTerms } from '../utils/ecosystem-match.util.js';
import { htmlToText } from '../utils/html-to-text.util.js';
import { inNatal } from '../utils/natal.util.js';

// Área de Informática em Natal. O robots.txt do BNE fecha /api/ para robôs:
// a fonte lê só as páginas.
const SEARCH_URL =
  'https://www.bne.com.br/vagas-de-emprego-na-area-de-informatica';

const SEARCH_PARAMS = {
  Area: 'Informatica',
  CityName: 'natal-rn',
};

const ACTIVE = 0;

// As ativas vêm antes das encerradas, 20 por página. Em Natal são poucas: o
// teto só impede uma volta sem fim se a ordem mudar.
const MAX_PAGES = 5;

const MIN_TECH_TERMS = 2;

const MIN_PAUSE_MS = 1000;
const MAX_PAUSE_MS = 3000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const FORMATO: Partial<Record<string, Formato>> = {
  Presencial: 'PRESENCIAL',
  'Home Office': 'REMOTO',
};

const MODELO: Partial<Record<string, Modelo>> = {
  Efetivo: 'CLT',
  Estágio: 'ESTAGIO',
  Autônomo: 'FREELANCE',
  Freelancer: 'FREELANCE',
};

const SENIORIDADE: Partial<Record<string, Senioridade>> = {
  Estágio: 'ESTAGIO',
};

export interface BneListedJob extends ListedJob {
  bne: BneJob;
}

// Sem findFinished: a listagem traz todas as vagas ativas de TI em Natal, e a
// que some dela encerrou.
@Injectable()
export class BneSource implements JobSource<BneListedJob> {
  readonly name = 'bne';
  readonly types: JobType[] = ['BNE'];
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
    @InjectPinoLogger(BneSource.name)
    private readonly logger: PinoLogger,
  ) {}

  async list(): Promise<BneListedJob[]> {
    const log = new ScopedLogger(this.logger, 'scraper.bne');
    const timer = log.start('batch_start', 'Buscando vagas no BNE', {
      params: SEARCH_PARAMS,
    });

    try {
      const byId = new Map<number, BneJob>();
      let pages = 0;
      let reachedClosed = false;

      for (let page = 1; page <= MAX_PAGES && !reachedClosed; page++) {
        if (page > 1) await pause();
        const jobs = await this.search(log.child({ page }), page);
        pages = page;

        if (jobs.length === 0) break;
        for (const job of jobs) {
          if (job.Status !== ACTIVE) reachedClosed = true;
          // Busca sem resultado mostra vagas parecidas de outros lugares.
          else if (job.City?.Name === 'Natal' && job.Area === 'Informática') {
            byId.set(job.Id, job);
          }
        }
      }

      // Sem chegar nas encerradas, a lista pode estar incompleta e o
      // encerramento fecharia vaga ainda aberta.
      if (!reachedClosed && pages === MAX_PAGES) {
        throw new Error(
          `Listagem do BNE com mais de ${MAX_PAGES} páginas de vagas ativas`,
        );
      }

      timer.info('batch_done', 'Vagas do BNE obtidas', {
        pages,
        count: byId.size,
      });

      return [...byId.values()].map((bne) => ({
        link: bne.Url,
        type: 'BNE',
        bne,
      }));
    } catch (err: unknown) {
      timer.error('batch_failed', 'Falha ao buscar as vagas do BNE', { err });
      throw err;
    }
  }

  async fetchDetails(jobs: BneListedJob[]): Promise<VagaJobPayload[]> {
    const log = new ScopedLogger(this.logger, 'scraper.bne');
    const timer = log.start('details.start', 'Abrindo as páginas das vagas', {
      count: jobs.length,
    });

    const payloads: VagaJobPayload[] = [];
    const discarded: { title: string; terms: string[] }[] = [];
    let failed = 0;

    // Vaga que falha fica fora do banco e volta a ser tentada na próxima
    // coleta.
    for (const [index, { bne }] of jobs.entries()) {
      const jobLog = log.child({ bneId: bne.Id });

      try {
        if (index > 0) await pause();
        const page = await this.getJobPage(jobLog, bne.Url);

        if (!page) {
          failed++;
          continue;
        }

        const title = jobTitle(bne);
        const description = describe(bne, page);
        const terms = matchedEcosystemTerms(`${title} ${description}`);

        if (terms.length < MIN_TECH_TERMS) {
          discarded.push({ title, terms });
          continue;
        }

        // Toda vaga vem da busca de Natal.
        payloads.push(inNatal(this.toJob(bne, page, title, description)));
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

  private async search(log: ScopedLogger, page: number): Promise<BneJob[]> {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({
      ...SEARCH_PARAMS,
      Page: String(page),
    }).toString();
    const timer = log.start('list.start', 'Buscando página da listagem', {
      url: url.toString(),
    });

    try {
      const response = await fetch(url, { headers: HEADERS });

      if (!response.ok) {
        throw new Error(`Busca do BNE respondeu ${response.status}`);
      }

      const $ = cheerio.load(await response.text());
      const raw = $('#jobInfoLocal').attr('value');

      // Página sem resultado também traz o input, com a lista vazia.
      if (raw === undefined) {
        throw new Error('Página da busca do BNE sem o JSON das vagas');
      }

      const jobs = JSON.parse(raw || '[]') as unknown;
      if (!Array.isArray(jobs)) {
        throw new Error('JSON da busca do BNE sem a lista de vagas');
      }

      timer.info('list.done', 'Página da listagem obtida', {
        count: jobs.length,
      });

      return jobs as BneJob[];
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
  ): Promise<BneJobPage | null> {
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
    const descriptionHtml = jsonLdDescription($);

    if (descriptionHtml === null) {
      log.warn('job_page.no_data', 'Página da vaga sem o JSON-LD da vaga');
      return null;
    }

    // "Cargo: desenvolvedor", "Modalidade: Presencial", "Contrato: Efetivo".
    const fields: Record<string, string> = {};
    $('.job__open__infos-item').each((_, item) => {
      const label = $(item).children('strong').first().text();
      const value = $(item).children('span').last().text();
      fields[label.replace(/:\s*$/, '').trim()] = value
        .replace(/\s+/g, ' ')
        .trim();
    });

    return {
      descriptionHtml,
      modality: fields['Modalidade'] || null,
      contract: fields['Contrato'] || null,
    };
  }

  private toJob(
    bne: BneJob,
    page: BneJobPage,
    title: string,
    description: string,
  ): VagaJobPayload {
    return {
      title,
      type: 'BNE',
      link: bne.Url,
      description,
      isActive: true,
      publishedAt: bne.PostDate,
      attributes: this.toAttributes(bne, page),
    };
  }

  // Só entra o que o BNE informa de fato; campo ausente fica com a IA.
  private toAttributes(bne: BneJob, page: BneJobPage): Partial<VagaAttributes> {
    const attributes: Partial<VagaAttributes> = {};

    const formato = bne.Home_Office ? 'REMOTO' : FORMATO[page.modality ?? ''];
    if (formato) attributes.formato = formato;

    const contract = page.contract ?? bne.LinkType[0] ?? '';
    const modelo = MODELO[contract];
    if (modelo) attributes.modelo = modelo;

    const senioridade = SENIORIDADE[contract];
    if (senioridade) attributes.senioridade = senioridade;

    // Faixa vale pelo menor valor, como a IA faz.
    if (bne.MinSalary > 0) attributes.salary = bne.MinSalary;

    return attributes;
  }
}

// "analista desenvolvedor" → "Analista desenvolvedor".
function jobTitle(bne: BneJob) {
  const name = bne.Function.Name.trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function describe(bne: BneJob, page: BneJobPage) {
  const salary =
    bne.MinSalary > 0
      ? bne.MaxSalary > bne.MinSalary
        ? `R$ ${bne.MinSalary} a R$ ${bne.MaxSalary}`
        : `R$ ${bne.MinSalary}`
      : null;

  const header = [
    bne.CompanyName && `Empresa: ${bne.CompanyName}`,
    bne.City &&
      `Local: ${bne.City.Name}${bne.StateAbbreviation ? ` - ${bne.StateAbbreviation}` : ''}`,
    page.modality && `Modalidade: ${page.modality}`,
    page.contract && `Contrato: ${page.contract}`,
    salary && `Salário: ${salary}`,
  ].filter(Boolean);

  return [...header, htmlToText(page.descriptionHtml)].join('\n');
}

function jsonLdDescription($: cheerio.CheerioAPI): string | null {
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      const data = JSON.parse($(script).text()) as {
        '@type'?: string;
        description?: string;
      };
      if (data['@type'] === 'JobPosting' && data.description) {
        return data.description;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function pause() {
  return sleep(MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
}
