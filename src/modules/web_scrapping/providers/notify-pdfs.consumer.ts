import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
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
    @InjectPinoLogger(NotifyNewPdf.name)
    private readonly logger: PinoLogger,
  ) {
    super();
  }

  async process(job: Job) {
    const startedAt = Date.now();
    const user = job.data as Awaited<
      ReturnType<UserService['findManyUsers']>
    >[number];

    this.logger.debug(
      {
        evt: 'queue.notify_pdfs.job_start',
        queue: 'sendPdf',
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        userId: user.id,
      },
      'Buscando PDFs que citam o usuário',
    );

    try {
      const pdfs = await this.pdfService.findAllActiveByUserName(user.name);

      this.logger.debug(
        {
          evt: 'queue.notify_pdfs.matched',
          queue: 'sendPdf',
          jobId: job.id,
          userId: user.id,
          count: pdfs.length,
        },
        'PDFs encontrados para o usuário',
      );

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

          this.logger.info(
            {
              evt: 'queue.notify_pdfs.message_sent',
              queue: 'sendPdf',
              jobId: job.id,
              userId: user.id,
              pdfId: pdf.id,
              editalId: pdf.editalId,
              pdfType: pdf.type,
            },
            'PDF que cita o usuário enviado',
          );
        }),
      );

      this.logger.info(
        {
          evt: 'queue.notify_pdfs.job_done',
          queue: 'sendPdf',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          count: pdfs.length,
          durationMs: Date.now() - startedAt,
        },
        'Envio de PDFs do usuário concluído',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.notify_pdfs.job_failed',
          queue: 'sendPdf',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao enviar PDFs do usuário',
      );
      throw new BadRequestException(e);
    }
  }
}
