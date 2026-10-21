import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { JobsService } from '../../jobs/services/jobs.service.js';
import { matchesEcosystem } from './ecosystem-match.util.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

interface FilterableEdital {
  title: string;
  link: string;
  pdfs: { text: string }[];
}

@Injectable()
export class EcosystemFilterService {
  constructor(
    private readonly jobsService: JobsService,
    @InjectPinoLogger(EcosystemFilterService.name)
    private readonly logger: PinoLogger,
  ) {}

  // Fontes que publicam seleções de qualquer área (saúde, administrativo...):
  // só entra edital novo que cita algum termo de ecossistema no título ou nos
  // PDFs. Edital já gravado passou no filtro antes e só traz PDFs novos
  // (resultados), que precisam ser gravados para a busca de nomes citados.
  async filter<T extends FilterableEdital>(
    source: string,
    editais: T[],
  ): Promise<T[]> {
    const log = new ScopedLogger(this.logger, 'scraper', { source });

    const known = await this.jobsService.findManyByLink(
      editais.map((edital) => edital.link),
    );
    const knownLinks = new Set(known.map((job) => job.link));
    const kept = editais.filter(
      (edital) =>
        knownLinks.has(edital.link) ||
        matchesEcosystem(
          [edital.title, ...edital.pdfs.map((pdf) => pdf.text)].join(' '),
        ),
    );

    log.info('ecosystem_filter', 'Editais filtrados por ecossistema', {
      count: editais.length,
      kept: kept.length,
      discarded: editais
        .filter((edital) => !kept.includes(edital))
        .map((edital) => edital.title),
    });

    return kept;
  }
}
