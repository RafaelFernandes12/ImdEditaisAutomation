import { PdfService } from '../../pdf/services/pdf.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { UserService } from '#src/modules/user/services/user.service.js';
import { client } from '#src/config/whatsapp/client.js';
import { SendsService } from '../../sends/services/sends.service.js';

@Processor('sendPdf')
export class NotifyNewPdf extends WorkerHost {
  constructor(
    private pdfService: PdfService,
    private readonly sendsService: SendsService,
  ) {
    super();
  }
  async process(job: Job) {
    try {
      const user = job.data as Awaited<
        ReturnType<UserService['findManyUsers']>
      >[number];
      const pdfs = await this.pdfService.findAllByUserName(user.name);
      await Promise.all(
        pdfs.map(async (pdf) => {
          await this.sendsService.createMany([
            { userId: user.id, editalId: pdf.editalId, pdfId: pdf.id },
          ]);
          await client.sendMessage(
            user.chatId,
            `${pdf.edital.title} - ${pdf.edital.badge}
Seu nome foi mencionado no edital: ${pdf.edital.link}
Neste pdf de ${pdf.type}: ${pdf.link}
${pdf.edital.summary}
`,
          );
        }),
      );
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
