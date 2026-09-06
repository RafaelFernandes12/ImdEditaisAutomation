import { Logger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { EditalService } from '../../edital/services/edital.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { shortenUrl } from '../../../utils/shorten-url.js';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BadRequestException } from '@nestjs/common';

@Processor('notifyNewEditais')
export class NotifyNewEditaisConsumer extends WorkerHost {
  constructor(
    private userService: UserService,
    private editalService: EditalService,
    private readonly logger: Logger,
  ) {
    super();
  }

  async process(job: Job) {
    try {
      const user = job.data as Awaited<
        ReturnType<UserService['findManyUsers']>
      >[number];

      const editaisAndamento = await this.editalService.findActive();
      const newEditais = editaisAndamento.filter(
        (e) => !user.sends.some((uSends) => uSends.editalId === e.id),
      );

      if (newEditais.length === 0) return;

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

      await client.sendMessage(user.chatId, editaisLines.join('\n\n'));
      await this.userService.updateEditaisUser({
        contact: user.contact,
        editaisId: newEditais.map((e) => e.id),
      });
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
