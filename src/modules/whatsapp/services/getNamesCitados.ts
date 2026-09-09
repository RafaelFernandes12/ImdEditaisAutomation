import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { PdfService } from '../../pdf/services/pdf.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { formatDate } from '#src/utils/formate-date.js';

@Injectable()
export class GetNamesCitados {
  constructor(
    private readonly pdfService: PdfService,
    private readonly userService: UserService,
    @InjectPinoLogger(GetNamesCitados.name)
    private readonly logger: PinoLogger,
  ) {}

  async execute(message: pkg.Message) {
    const startedAt = Date.now();

    // TODO
    this.logger.warn(
      {
        evt: 'wa.names_citados.stub',
        chatId: maskContact(message.from),
      },
      'GetNamesCitados executado com parâmetros fixos (TODO pendente)',
    );

    const user = await this.userService.findByChatId('oi');
    const editais = await this.pdfService.findAllResultadosByUserName('rafael');

    if (editais.length === 0) {
      this.logger.info(
        {
          evt: 'wa.names_citados.empty',
          chatId: maskContact(message.from),
          userFound: user !== null,
          durationMs: Date.now() - startedAt,
        },
        'Nenhum resultado encontrado para o usuário',
      );
      await message.reply('Nenhum edital em andamento no momento.');
      return;
    }

    const body = editais
      .map((pdf, index) => {
        return (
          `*${index + 1}. ${pdf.edital.title}*\n` +
          `🗓️ Inscrições até: ${formatDate(pdf.edital.subscriptionUntil)}\n` +
          `🔗 ${pdf.edital.link}\n` +
          `${pdf.label}:${pdf.link}\n` +
          `${pdf.edital.summary}`
        );
      })
      .join('\n\n');

    await message.reply(`📢 *Editais que você se inscreveu*\n\n${body}`);

    this.logger.info(
      {
        evt: 'wa.names_citados.done',
        chatId: maskContact(message.from),
        userFound: user !== null,
        count: editais.length,
        messageLength: body.length,
        durationMs: Date.now() - startedAt,
      },
      'Resultados citando o usuário enviados',
    );
  }
}
