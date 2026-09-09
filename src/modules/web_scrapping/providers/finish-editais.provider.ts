import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { EditaisScraperService } from '../services/editais-scraper.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class FinishEditaisProvider {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private editalService: EditalService,
    @InjectPinoLogger(FinishEditaisProvider.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async execute() {
    const startedAt = Date.now();

    this.logger.info(
      { evt: 'cron.finish_editais.start', cron: true },
      'Verificando editais encerrados',
    );

    try {
      const editaisFinished =
        await this.editaisScraperService.getEditaisFinished();
      const dbActiveEditais = await this.editalService.findActive();

      this.logger.debug(
        {
          evt: 'cron.finish_editais.candidates',
          cron: true,
          finishedOnSite: editaisFinished.length,
          activeInDb: dbActiveEditais.length,
        },
        'Comparando editais encerrados com os ativos no banco',
      );

      let unparsedValidUntil = 0;

      const editais = dbActiveEditais
        .flatMap((ef) =>
          editaisFinished.flatMap((dae) => {
            if (dae.badge === ef.badge && dae.title === ef.title) {
              const split = ef.pdfs
                ?.at(0)
                ?.text.split('\n')
                ?.find((v) => v.match('validade'))
                ?.match(/(\d+)\s*(?:\([^)]*\)\s*)?m[eê]s(?:es)?/i)?.[1];

              const validUntil = Number(split);

              if (Number.isNaN(validUntil)) {
                unparsedValidUntil += 1;
                this.logger.warn(
                  {
                    evt: 'cron.finish_editais.valid_until_unparsed',
                    cron: true,
                    editalId: ef.id,
                    editalTitle: ef.title,
                    hasPdf: Boolean(ef.pdfs?.at(0)),
                  },
                  'Não foi possível extrair a validade do edital',
                );
              }

              return {
                id: ef.id,
                validUntil,
              };
            }
          }),
        )
        .filter((f) => f !== undefined);

      await this.editalService.deactivateMany(editais);

      this.logger.info(
        {
          evt: 'cron.finish_editais.done',
          cron: true,
          finishedOnSite: editaisFinished.length,
          activeInDb: dbActiveEditais.length,
          deactivated: editais.length,
          unparsedValidUntil,
          durationMs: Date.now() - startedAt,
        },
        'Editais encerrados atualizados',
      );
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'cron.finish_editais.failed',
          cron: true,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao encerrar editais',
      );
      throw error;
    }
  }
}
