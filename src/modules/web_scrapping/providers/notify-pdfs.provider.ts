import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { client } from '../../../config/whatsapp/client.js';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PdfSendsService } from '../../pdf_sends/services/pdf-sends.service.js';
import { CreatePdfSend } from '#src/modules/pdf_sends/dto/pdf-sends.dto.js';
import { PdfTipo } from '#generated/prisma/enums.js';
import { messages } from '../../../utils/whatsapp_messages.js';
import { EditalToUserService } from '../../edital_to_user/services/edital-to-user.service.js';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class NotifyPdfsProvider {
  constructor(
    private userService: UserService,
    private pdfService: PdfService,
    private pdfSendService: PdfSendsService,
    private editalToUserService: EditalToUserService,
    @InjectQueue('sendPdf') private queue: Queue,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    await this.ensureWhatsappReady();

    const users = await this.userService.findManyUsers();
    const pdfsResultado = await this.pdfService.findAll(users.at(0)!.name);

    const pdfsHomologUser = await Promise.all(
      users.map(async (user) => {
        // const nameRe = new RegExp(user.name, 'i');
        //
        // const userPdf = pdfsResultado.filter((pdf) => nameRe.test(pdf.text));
        // if (userPdf.length === 0) return null;
        //
        // await this.queue.add('pdf', {
        //   chatId: user.chatId,
        //   pdfIds: userPdf.map((pdf) => pdf.id),
        // });

        await client.sendMessage(user.chatId, 'lancou o pdf');
      }),
    );
  }

  private async ensureWhatsappReady() {
    const state = await client.getState().catch(() => null);
    if (state !== 'CONNECTED') {
      throw new ServiceUnavailableException(
        'WhatsApp não está conectado. Faça o login antes de notificar.',
      );
    }
  }

  private async addToQueue(
    chatId: string,
    editalToUserId: number,
    edital: {
      title: string;
      badge: string;
      link: string;
      pdf: { link: string; type: PdfTipo };
    },
    addToQueue: CreatePdfSend[],
  ) {
    const editalInfo = `Seu nome foi mencionado no edital ${edital.title}, de tipo ${edital.pdf.type}\nLink do edital: ${edital.link}\nLink do pdf: ${edital.pdf.link}`;
    await client.sendMessage(chatId, editalInfo);
    await this.pdfSendService.createMany(addToQueue);
    await this.editalToUserService.updateStatus({
      id: editalToUserId,
      status: 'HOMOLOGACAO',
    });
  }
}
