import { Injectable } from '@nestjs/common';
import pkg from 'whatsapp-web.js';
import { Logger } from 'nestjs-pino';
import { EditalService } from '../../edital/services/edital.service.js';
import { GetEditaisAndamento } from './getEditaisAndamento.js';
import { UserService } from '../../user/services/user.service.js';
import { client } from '../../../config/whatsapp/client.js';
import { UploadOne } from '../../../modules/files/upload-one.js';

type loginData = {
  name?: string;
  matricula?: string;
  vitae?: string;
  lattes?: string;
};

@Injectable()
export class LoginService {
  constructor(
    private editalService: EditalService,
    private userService: UserService,
    private getEditaisAndamento: GetEditaisAndamento,
    private uploadOne: UploadOne,
    private readonly logger: Logger,
  ) {}

  private readonly steps: {
    key: keyof loginData;
    prompt: string;
    type: 'text' | 'media';
  }[] = [
    {
      key: 'name',
      prompt: 'Escreva seu nome completo: (Obrigatorio)',
      type: 'text',
    },
    {
      key: 'matricula',
      prompt: 'Agora escreva sua matrícula: (Obrigatorio)',
      type: 'text',
    },
    {
      key: 'vitae',
      prompt:
        'Anexe o seu currículo vitae, isso ajudará a ordenar as suas vagas de interesse: (Opcional, caso não queira, apenas digite NAO)',
      type: 'media',
    },
    {
      key: 'lattes',
      prompt:
        'Anexe o seu currículo lattes: (Opcional, caso não queira, apenas digite NAO)',
      type: 'media',
    },
  ];
  private pendingLogin = new Map<
    string,
    { stepIndex: number; data: loginData }
  >();

  isPending(chatId: string) {
    return this.pendingLogin.has(chatId);
  }

  async handlePendingStep(message: pkg.Message) {
    try {
      const pending = this.pendingLogin.get(message.from);
      if (!pending) return;

      const currentStep = this.steps[pending.stepIndex];
      if (currentStep.type === 'media') {
        if (message.body.trim().toUpperCase() === 'NAO') {
          pending.data[currentStep.key] = undefined;
        } else if (message.hasMedia) {
          const media = await message.downloadMedia();
          const mediaBuffer = Buffer.from(media.data, 'base64');
          const mediaUrl = await this.uploadOne.uploadFile({
            contentType: media.mimetype,
            path: await client.getFormattedNumber(message.to),
            fileName: currentStep.key === 'vitae' ? 'vitae.pdf' : 'lattes.pdf',
            fileStream: mediaBuffer,
          });
          pending.data[currentStep.key] = mediaUrl.Key;
        } else {
          await message.reply('Envie um arquivo indexado ou digite NAO');
        }
      } else {
        pending.data[currentStep.key] = message.body;
      }

      const nextIndex = pending.stepIndex + 1;
      if (nextIndex < this.steps.length) {
        pending.stepIndex = nextIndex;
        await message.reply(this.steps[nextIndex].prompt);
        return;
      }

      this.pendingLogin.delete(message.from);
      await this.completeLogin(message, pending.data);
    } catch (e) {
      console.log(e);
      throw new Error(e);
    }
  }

  async login(message: pkg.Message) {
    await message.reply(this.steps[0].prompt);
    this.pendingLogin.set(message.from, { stepIndex: 0, data: {} });
  }

  private async completeLogin(message: pkg.Message, data: loginData) {
    const editaisId = (await this.editalService.findActive()).map(
      (id) => id.id,
    );
    await this.userService.createUser({
      chatId: message.from,
      contact: await client.getFormattedNumber(message.to),
      name: data.name!,
      matricula: data.matricula!,
      curriculoVitae: this.parseOptional(data.vitae),
      curriculoLattes: this.parseOptional(data.lattes),
      editaisId,
    });
    await this.getEditaisAndamento.execute(message);
  }

  private parseOptional(value?: string) {
    return value && value.trim().toUpperCase() !== 'NAO' ? value : undefined;
  }
}
