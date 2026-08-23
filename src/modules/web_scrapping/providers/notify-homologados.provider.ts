import { Injectable } from '@nestjs/common';
import { client } from '../../../config/whatsapp/client.js';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../../modules/pdf/services/pdf.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PdfSendsService } from '../../../modules/pdf_sends/services/pdf-sends.service.js';
import { CreatePdfSend } from '#src/modules/pdf_sends/dto/pdf-sends.dto.js';
import { PdfTipo } from '#generated/prisma/enums.js';
import { messages } from '../../../utils/whatsapp_messages.js';
import { EditalToUserService } from '../../../modules/edital_to_user/services/edital-to-user.service.js';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class NotifyHomologProvider {
  constructor(
    private userService: UserService,
    private pdfService: PdfService,
    private pdfSendService: PdfSendsService,
    private editalToUserService: EditalToUserService,
    @InjectQueue('scanHomolog') private scanHomologQueue: Queue,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    const users = await this.userService.findManyUsers();
    const pdfsHomolog = await this.pdfService.findByLabel('HOMOLOGACAO');

    const pdfsHomologUser = users.flatMap(async (user) => {
      const name = user.name.toLowerCase();
      const nameRe = new RegExp(name);
      const approvedRe = new RegExp(
        `(?<!in)(?<!não\\s+)(?<!nao\\s+)(?:homolog|defer)`,
      );

      const matchedPdf = pdfsHomolog.find((pdf) =>
        pdf.text.split('\n').some((line) => nameRe.test(line.toLowerCase())),
      );
      if (!matchedPdf) return;
      const matchedLine = matchedPdf.text
        .split('\n')
        .find((line) => nameRe.test(line.toLowerCase()))!
        .toLowerCase();

      const editalToUser = user.editais.find((v) => matchedPdf.id === v.id);
      if (!editalToUser) return;

      if (!approvedRe.test(matchedLine)) {
        await this.scanHomologQueue.add(
          'scanHomologQueue',
          this.notifyNotHomolog(user.chatId, editalToUser.id),
        );
        return;
      }

      const res = editalToUser.edital.pdfs
        .filter((pdf) => pdf.type === 'HOMOLOGACAO')
        .map((pdf) => ({
          pdfId: pdf.id,
          editalToUserId: editalToUser.id,
        }));

      await this.scanHomologQueue.add(
        'scanHomologQueue',
        this.addToQueue(user.chatId, editalToUser.id, editalToUser.edital, res),
      );
    });

    return pdfsHomologUser;
  }

  async addToQueue(
    chatId: string,
    editalToUserId: number,
    edital:
      | {
          title: string;
          badge: string;
          link: string;
          pdfs: { link: string; type: PdfTipo }[];
        }
      | undefined,
    addToQueue: CreatePdfSend[],
  ) {
    const linkEditalHomolog = edital?.pdfs
      .filter((pdf) => pdf.type === 'HOMOLOGACAO')
      .at(-1);
    const editalInfo = edital
      ? `\n\nEdital: ${edital.badge} - ${edital.title}\nLink edital: ${edital.link}\nLink Homologação: ${linkEditalHomolog?.link}`
      : '';
    await client.sendMessage(chatId, messages('homologScan', editalInfo));
    await this.pdfSendService.createMany(addToQueue);
    await this.editalToUserService.updateStatus({
      id: editalToUserId,
      status: 'HOMOLOGACAO',
    });
  }

  async notifyNotHomolog(chatId: string, editalToUserId: number) {
    await client.sendMessage(chatId, messages('notHomologScan', ''));
    await this.editalToUserService.updateStatus({
      id: editalToUserId,
      status: 'FAILED',
    });
  }
}
