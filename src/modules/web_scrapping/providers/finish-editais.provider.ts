/* eslint-disable */
import { Injectable } from '@nestjs/common';
import { EditalService } from '../../edital/services/edital.service.js';
import { EditaisScraperService } from '../services/editais-scraper.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class FinishEditaisProvider {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private editalService: EditalService,
  ) {}

  @Cron(CronExpression.EVERY_6_HOURS)
  async execute() {
    const editaisFinished =
      await this.editaisScraperService.getEditaisFinished();
    const dbActiveEditais = await this.editalService.findActive();

    const editais = dbActiveEditais
      .flatMap((ef) =>
        editaisFinished.flatMap((dae) => {
          if (dae.badge === ef.badge && dae.title === ef.title) {
            const split = ef.pdfs
              ?.at(0)
              ?.text.split('\n')
              ?.find((v) => v.match('validade'))
              ?.match(/(\d+)\s*(?:\([^)]*\)\s*)?m[eê]s(?:es)?/i)?.[1];
            return {
              id: ef.id,
              validUntil: Number(split),
            };
          }
        }),
      )
      .filter((f) => f !== undefined);

    await this.editalService.deactivateMany(editais);
  }
}
