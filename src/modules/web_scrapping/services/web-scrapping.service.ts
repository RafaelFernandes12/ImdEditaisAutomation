import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { WebScrappingRepository } from '../repositories/web-scrapping.repository.js';
import { Logger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { WhatsappRepository } from '../../whatsapp/repositories/whatsapp.repository.js';
import { client } from '../../../config/whatsapp/client.js';
import { Cron } from '@nestjs/schedule';
import { PdfTipo } from '../../../../generated/prisma/client.js';

function resolvePdfTipo(label: string): PdfTipo {
  const normalized = label.toLowerCase();
  if (normalized.includes('homolog')) return PdfTipo.HOMOLOGACAO;
  if (normalized.includes('resultado')) return PdfTipo.RESULTADO;
  return PdfTipo.EDITAL;
}

interface EditaisUrl {
  href: string;
  badge: string;
  title: string;
  subscriptionUntil: string;
}

@Injectable()
export class WebScrappingService {
  constructor(
    private webScrappingRepository: WebScrappingRepository,
    private whatsappRepository: WhatsappRepository,
    private userService: UserService,
    private readonly logger: Logger,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    this.logger.log('Start execute web-scrapping');

    const [resEmAndamento, resFinished] = await Promise.all([
      this.extractTextFromPdf(await this.getEditaisEmAndamento()),
      this.extractTextFromPdf(await this.getEditaisFinished()),
    ]);

    const editalPdfs = [
      ...resEmAndamento.map((r) => ({ ...r, isActive: true })),
      ...resFinished.map((r) => ({ ...r, isActive: false })),
    ].flatMap((v) => v.pdfs.flatMap((e) => ({ ...v, pdf: e })));

    await this.scanNewEditaisForSending();
    await this.scanEditaisFinished();
    const pdfBody = await Promise.all(
      editalPdfs.map(async (p) => {
        const edital = await this.webScrappingRepository.createEdital({
          badge: p.badge,
          title: p.title,
          link: p.link,
          isActive: p.isActive,
          subscriptionUntil: p.subscriptionUntil,
        });
        return {
          ...p.pdf,
          editalId: edital.id,
          type: resolvePdfTipo(p.pdf.label),
        };
      }),
    );

    await this.webScrappingRepository.createPdf(pdfBody);

    this.logger.log('Finish execute web-scrapping');
  }

  private async getEditaisPdfs(editaisUrl: EditaisUrl[]) {
    const res = Promise.all(
      editaisUrl.map(async (url) => {
        const edital = await fetch(url.href);
        const editalHTML = await edital.text();

        const $editaisLoaded = cheerio.load(editalHTML);

        const editalRow = $editaisLoaded('table.tb_noticias tr');

        const downloadHref = editalRow
          .find('a')
          .map((i, el) => ({
            label: $editaisLoaded(el)
              .closest('tr')
              .find('td')
              .eq(1)
              .text()
              .trim(),
            link: `https://www.metropoledigital.ufrn.br${$editaisLoaded(el).attr('href')}`,
          }))
          .get();

        return {
          ...url,
          link: url.href,
          href: downloadHref,
        };
      }),
    );

    return res;
  }

  private async getEditaisEmAndamento(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-andamentos');
  }

  private async getEditaisFinished(): Promise<EditaisUrl[]> {
    return this.getEditais('.box-editais-encerrados');
  }

  private async extractTextFromPdf(editaisUrl: EditaisUrl[]) {
    const editais = await this.getEditaisPdfs(editaisUrl);

    return Promise.all(
      editais.map(async (edital) => {
        const pdfs = await Promise.all(
          edital.href.map(async (e) => {
            const foundLink = await this.webScrappingRepository.getPdfByLink(
              e.link,
            );
            if (foundLink) return;
            const download = await fetch(e.link);
            const buffer = Buffer.from(await download.arrayBuffer());
            const parser = new PDFParse({ data: buffer });
            const { text } = await parser.getText();

            return { ...e, text };
          }),
        );
        return {
          badge: edital.badge,
          title: edital.title,
          link: edital.link,
          subscriptionUntil: edital.subscriptionUntil,
          pdfs: pdfs.filter((p) => p !== undefined),
        };
      }),
    );
  }

  private async getEditais(boxName: string) {
    const editais = await fetch(
      'https://www.metropoledigital.ufrn.br/portal/editais',
    );
    const editaisHTML = await editais.text();
    const $editaisLoaded = cheerio.load(editaisHTML);

    const editaisHref: EditaisUrl[] = $editaisLoaded(boxName)
      .find('a')
      .map((_, el) => ({
        href: `https://www.metropoledigital.ufrn.br${$editaisLoaded(el).attr('href')}`,
        badge: $editaisLoaded(el).find('.badge').text(),
        title: $editaisLoaded(el).find('h5').text(),
        subscriptionUntil: $editaisLoaded(el)
          .find('p')
          .text()
          .trim()
          .substring(0, 25),
      }))
      .get();

    return editaisHref;
  }

  private async scanNewEditaisForSending() {
    const users = await this.userService.findManyUsers();
    const editaisAndamento = await this.whatsappRepository.getEditaisActive();
    const newEditais = users.map((u) => ({
      u,
      editais: editaisAndamento.filter(
        (e) => !u.editais.some((uEdital) => uEdital.editalId === e.id),
      ),
    }));

    await Promise.all(
      newEditais.map(async (ne) => {
        const body = ne.editais
          .map((edital, index) => {
            const pdfLines = edital.pdfs
              .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
              .join('\n');

            return (
              `*${index + 1}. ${edital.title}*\n` +
              `🗓️ Inscrições até: ${edital.subscriptionUntil}\n` +
              `🔗 ${edital.link}\n` +
              `${pdfLines}`
            );
          })
          .join('\n\n');

        if (ne.editais.length === 0) return;

        await client.sendMessage(ne.u.chatId, body);
        await this.userService.updateEditaisUser({
          contact: ne.u.contact,
          editaisId: ne.editais.map((e) => e.id),
        });
      }),
    );
  }

  private async scanEditaisFinished() {
    const editaisFinished = await this.getEditaisFinished();
    const dbActiveEditais = await this.whatsappRepository.getEditaisActive();
    const editais = dbActiveEditais.filter((ef) =>
      editaisFinished.some(
        (dae) => dae.badge === ef.badge && dae.title === ef.title,
      ),
    );
    await this.webScrappingRepository.updateIsActiveEdital(
      editais.map((e) => e.id),
    );

    console.log('EDITAIS', editais);
  }
}
