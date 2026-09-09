import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { EditalService } from '../../edital/services/edital.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';

@Processor('notifyNewEditais')
export class NotifyNewEditaisConsumer extends WorkerHost {
  constructor(
    private userService: UserService,
    private editalService: EditalService,
    @InjectPinoLogger(NotifyNewEditaisConsumer.name)
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
        evt: 'queue.notify_new_editais.job_start',
        queue: 'notifyNewEditais',
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        userId: user.id,
      },
      'Verificando novos editais para o usuário',
    );

    try {
      const editaisAndamento = await this.editalService.findActive();
      const newEditais = editaisAndamento.filter(
        (e) => !user.sends.some((uSends) => uSends.editalId === e.id),
      );

      if (newEditais.length === 0) {
        this.logger.debug(
          {
            evt: 'queue.notify_new_editais.nothing_new',
            queue: 'notifyNewEditais',
            jobId: job.id,
            userId: user.id,
            activeCount: editaisAndamento.length,
            durationMs: Date.now() - startedAt,
          },
          'Nenhum edital novo para o usuário',
        );
        return;
      }

      const editaisLines = newEditais.map((edital, index) => {
        const pdfLines = edital.pdfs
          .map((pdf) => `   📎 ${pdf.label}: ${pdf.link}`)
          .join('\n');

        return (
          `*${index + 1}. ${edital.title}*\n` +
          `🗓️ Inscrições até: ${edital.subscriptionUntil}\n` +
          `🔗 ${edital.link}\n` +
          `${pdfLines}\n` +
          `${edital.summary}`
        );
      });

      const body = editaisLines.join('\n\n');

      const sendStartedAt = Date.now();
      await client.sendMessage(user.chatId, body);

      this.logger.info(
        {
          evt: 'queue.notify_new_editais.message_sent',
          queue: 'notifyNewEditais',
          jobId: job.id,
          userId: user.id,
          newEditaisCount: newEditais.length,
          messageLength: body.length,
          durationMs: Date.now() - sendStartedAt,
        },
        'Mensagem de novos editais enviada',
      );

      await this.userService.updateEditaisUser({
        contact: user.contact,
        editaisId: newEditais.map((e) => e.id),
      });

      this.logger.info(
        {
          evt: 'queue.notify_new_editais.job_done',
          queue: 'notifyNewEditais',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          newEditaisCount: newEditais.length,
          durationMs: Date.now() - startedAt,
        },
        'Usuário notificado sobre novos editais',
      );
    } catch (e: unknown) {
      this.logger.error(
        {
          evt: 'queue.notify_new_editais.job_failed',
          queue: 'notifyNewEditais',
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          userId: user.id,
          durationMs: Date.now() - startedAt,
          err: e,
        },
        'Falha ao notificar usuário sobre novos editais',
      );
      throw new BadRequestException(e);
    }
  }
}
