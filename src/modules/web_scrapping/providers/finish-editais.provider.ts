import { Injectable } from '@nestjs/common';
import { EditalService } from '../../edital/services/edital.service.js';
import { EditaisScraperService } from '../services/editais-scraper.service.js';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class FinishEditaisProvider {
  constructor(
    private editaisScraperService: EditaisScraperService,
    private editalService: EditalService,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    const editaisFinished =
      await this.editaisScraperService.getEditaisFinished();
    const dbActiveEditais = await this.editalService.findActive();
    const editais = dbActiveEditais.filter((ef) =>
      editaisFinished.some(
        (dae) => dae.badge === ef.badge && dae.title === ef.title,
      ),
    );
    await this.editalService.deactivateMany(editais.map((e) => e.id));
  }
}
