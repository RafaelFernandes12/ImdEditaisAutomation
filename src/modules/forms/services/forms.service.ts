import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { UserService } from '../../user/services/user.service.js';
import { FormAnswerService } from './form-answer.service.js';
import { AnswerFormDto } from '../dto/answer-form.dto.js';

@Injectable()
export class FormsService {
  constructor(
    private readonly userService: UserService,
    private readonly formAnswerService: FormAnswerService,
    private readonly logger: Logger,
  ) {}

  async answer(dto: AnswerFormDto) {
    const user = await this.userService.findByExtensionToken(dto.token);
    if (!user) {
      throw new UnauthorizedException('Invalid extension token');
    }

    const answers = await this.formAnswerService.draft(
      {
        name: user.name,
        matricula: user.matricula,
        curriculoVitae: user.curriculoVitae,
        curriculoLattes: user.curriculoLattes,
      },
      dto.questions,
    );

    this.logger.log(
      `Drafted ${answers.length}/${dto.questions.length} answers for user ${user.id} ("${dto.title}")`,
    );

    return { answers };
  }
}
