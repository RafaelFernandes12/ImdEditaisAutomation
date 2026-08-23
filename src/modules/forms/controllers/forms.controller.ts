import { Body, Controller, Post } from '@nestjs/common';
import { FormsService } from '../services/forms.service.js';
import { AnswerFormDto } from '../dto/answer-form.dto.js';

@Controller('forms')
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Post('/answer')
  async answer(@Body() dto: AnswerFormDto) {
    return this.formsService.answer(dto);
  }
}
