import { Logger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { resolvePdfTipo } from '../services/pdf-tipo.util.js';
import { extractAllKeywords } from '../services/edital-summary-parser.util.js';
import { trimEditalForSummary } from '../services/edital-text-trimmer.util.js';
import { SummarizeEdital } from '../../../modules/ai_chat/services/summarize-edital.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { UserService } from '#src/modules/user/services/user.service.js';
import { client } from '#src/config/whatsapp/client.js';
import { PdfSendsService } from '../../pdf_sends/services/pdf-sends.service.js';
import { EditalToUserService } from '../../edital_to_user/services/edital-to-user.service.js';

@Processor('sendPdf')
export class NotifyNewPdf extends WorkerHost {
  constructor(
    private editalService: EditalService,
    private pdfService: PdfService,
    private summarizeEdital: SummarizeEdital,
    private readonly logger: Logger,
    private readonly pdfSendService: PdfSendsService,
    private readonly editalToUserService: EditalToUserService,
  ) {
    super();
  }
  async process(job: Job) {
    try {
      const user = job.data as Awaited<
        ReturnType<UserService['findManyUsers']>
      >[number];
      const pdfs = await this.pdfService.findAll(user.name);
      await Promise.all(
        pdfs.map(async (pdf) => {
          await client.sendMessage(
            user.chatId,
            `${pdf.edital.title} - ${pdf.edital.badge}
Seu nome foi mencionado no edital: ${pdf.edital.link}
Neste pdf de ${pdf.type}: ${pdf.link}`,
          );

          await this.editalToUserService.upsert(1, {
            editalId: 1,
            userId: user.id,
            status: 'HOMOLOGACAO',
          });
          // await this.pdfSendService.createMany([{ edi }]);
        }),
      );
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
