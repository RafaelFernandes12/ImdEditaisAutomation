import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';
import { UserService } from '#src/modules/user/services/user.service.js';
import { client } from '#src/config/whatsapp/client.js';
import { SendsService } from '../../sends/services/sends.service.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

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
    const user = job.data as Awaited<
      ReturnType<UserService['findManyUsers']>
    >[number];
    const log = new ScopedLogger(this.logger, 'queue.notify_pdfs', {
      queue: 'sendPdf',
      queueJobId: job.id,
      attempt: job.attemptsMade + 1,
      userId: user.id,
    });

    const timer = log.start(
      'job_start',
      'Buscando PDFs que citam o usuário',
      undefined,
      'debug',
    );

    try {
      const pdfs = await this.pdfService.findAllActiveByUserName(user.name);

      log.debug('matched', 'PDFs encontrados para o usuário', {
        count: pdfs.length,
      });

      await Promise.all(
        pdfs.map(async (pdf) => {
          const pdfLog = log
            .child({ pdfId: pdf.id, jobId: pdf.editalId, pdfType: pdf.type })
            .timed();

          try {
            const recorded = await this.sendsService.createMany([
              { userId: user.id, jobId: pdf.editalId, pdfId: pdf.id },
            ]);

            // `createMany` com skipDuplicates é atômico: count 0 significa que
            // outro processo (ou uma execução anterior do cron) já enviou este PDF.
            if (recorded.count === 0) {
              pdfLog.debug(
                'already_sent',
                'PDF já enviado anteriormente para o usuário',
              );
              return;
            }

            pdfLog.debug(
              'send_recorded',
              'Envio registrado antes do disparo no WhatsApp',
            );

            await client.sendMessage(
              user.chatId,
              `${pdf.edital.job.title}
Seu nome foi mencionado no edital: ${pdf.edital.job.link}
Neste pdf de ${pdf.type}: ${pdf.link}
${pdf.edital.job.summary}
`,
            );

            pdfLog.info('message_sent', 'PDF que cita o usuário enviado');
          } catch (e: unknown) {
            pdfLog.error(
              'pdf_failed',
              'Falha ao enviar PDF que cita o usuário',
              {
                err: e,
              },
            );
            throw e;
          }
        }),
      );

      timer.info('job_done', 'Envio de PDFs do usuário concluído', {
        count: pdfs.length,
      });
    } catch (e: unknown) {
      timer.error('job_failed', 'Falha ao enviar PDFs do usuário', { err: e });
      throw new BadRequestException(e);
    }
  }
}
