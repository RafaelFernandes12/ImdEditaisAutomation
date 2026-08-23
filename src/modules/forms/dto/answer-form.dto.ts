import { FormQuestion } from '../forms.types.js';

// Plain DTO (project has no global ValidationPipe / class-validator).
export class AnswerFormDto {
  token: string;
  title: string;
  questions: FormQuestion[];
}
