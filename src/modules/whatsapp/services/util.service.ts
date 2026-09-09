import { maskContact } from '#src/utils/log-redact.js';
import { PinoLogger } from 'nestjs-pino';
import pkg from 'whatsapp-web.js';

export async function getFormattedContact(
  client: pkg.Client,
  message: pkg.Message,
) {
  const logger = new PinoLogger({});
  let userId = message.from;

  if (userId.endsWith('@lid')) {
    const [resolved] = await client.getContactLidAndPhone([userId]);

    if (!resolved?.pn) {
      const contact = await message.getContact();
      logger.warn(
        {
          evt: 'login.contact.lid_unresolved',
          chatId: maskContact(message.from),
          fallbackFound: Boolean(contact.number),
        },
        'Não foi possível resolver o telefone a partir do @lid',
      );
      return contact.number ?? userId;
    }

    logger.debug(
      {
        evt: 'login.contact.lid_resolved',
        chatId: maskContact(message.from),
      },
      'Telefone resolvido a partir do @lid',
    );

    userId = resolved.pn;
  }

  return client.getFormattedNumber(userId);
}
