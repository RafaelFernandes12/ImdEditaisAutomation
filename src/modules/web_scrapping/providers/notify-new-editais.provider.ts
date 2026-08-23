import { Injectable } from '@nestjs/common';
import { UserService } from '../../user/services/user.service.js';
import { EditalService } from '../../edital/services/edital.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { Cron } from '@nestjs/schedule';
import { shortenUrl } from '../../../utils/shorten-url.js';

@Injectable()
export class NotifyNewEditaisProvider {
  constructor(
    private userService: UserService,
    private editalService: EditalService,
  ) {}

  // @Cron('5 * * * * *')
  async execute() {
    const users = await this.userService.findManyUsers();
    const editaisAndamento = await this.editalService.findActive();
    const newEditais = users.map((u) => ({
      u,
      editais: editaisAndamento.filter(
        (e) => !u.editais.some((uEdital) => uEdital.editalId === e.id),
      ),
    }));

    await Promise.all(
      newEditais.map(async (ne) => {
        const editaisLines = await Promise.all(
          ne.editais.map(async (edital, index) => {
            const pdfLines = await Promise.all(
              edital.pdfs
                .filter((pdf) => pdf.type === 'EDITAL')
                .map(async (pdf) => {
                  const pdfLink = await shortenUrl(pdf.link);
                  return `   📎 ${pdf.label}: ${pdfLink}`;
                }),
            ).then((lines) => lines.join('\n'));

            return (
              `*${index + 1}. ${edital.title}*\n` +
              `🗓️ Inscrições até: ${edital.subscriptionUntil}\n` +
              `🔗 ${edital.link}\n` +
              `${pdfLines}\n` +
              `${edital.summary}`
            );
          }),
        );

        const body = editaisLines.join('\n\n');

        if (ne.editais.length === 0) return;

        await client.sendMessage(ne.u.chatId, body);
        await this.userService.updateEditaisUser({
          contact: ne.u.contact,
          editaisId: ne.editais.map((e) => e.id),
        });
      }),
    );
  }
}
