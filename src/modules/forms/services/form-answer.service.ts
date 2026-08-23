import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { openAIClient } from '../../../config/openai/openai.service.js';
import { FormAnswer, FormQuestion } from '../forms.types.js';

interface UserProfile {
  name: string;
  matricula: string;
  curriculoVitae?: string | null;
  curriculoLattes?: string | null;
}

@Injectable()
export class FormAnswerService {
  constructor(private readonly logger: Logger) {}

  private buildPrompt(user: UserProfile, questions: FormQuestion[]): string {
    return `Você é um assistente que preenche formulários do Google em nome de um candidato.

PERFIL DO CANDIDATO:
- Nome: ${user.name}
- Matrícula: ${user.matricula}
- Currículo (Vitae): ${user.curriculoVitae ?? 'não informado'}
- Currículo (Lattes): ${user.curriculoLattes ?? 'não informado'}

REGRAS:
1. Responda cada pergunta usando os dados do perfil. Se não houver dado suficiente, faça a melhor inferência plausível e concisa.
2. Para perguntas com opções (type 2=escolha única, 3=lista suspensa, 4=caixas de seleção), a resposta DEVE ser exatamente um dos textos em "options". Para type 4, "answer" pode ser um array de opções.
3. Para texto livre (type 0 e 1), responda de forma curta e direta.
4. Retorne SOMENTE um JSON válido, sem markdown, sem comentários, no formato:
   {"answers":[{"entryId":"entry.123","answer":"..."}, ...]}
   Use array em "answer" apenas para caixas de seleção (type 4).

PERGUNTAS (JSON):
${JSON.stringify(questions)}
`;
  }

  async draft(
    user: UserProfile,
    questions: FormQuestion[],
  ): Promise<FormAnswer[]> {
    const response = await openAIClient.responses.create({
      model: 'gpt-4o-mini',
      input: this.buildPrompt(user, questions),
    });

    return this.parse(response.output_text, questions);
  }

  /** Tolerant parse: strip code fences, extract the JSON object, validate shape. */
  private parse(raw: string, questions: FormQuestion[]): FormAnswer[] {
    const validEntryIds = new Set(questions.map((q) => q.entryId));
    try {
      const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      const json = cleaned.slice(start, end + 1);
      const parsed = JSON.parse(json) as { answers?: FormAnswer[] };

      return (parsed.answers ?? []).filter(
        (a) => a && validEntryIds.has(a.entryId),
      );
    } catch (err) {
      this.logger.error(`Failed to parse AI form answers: ${err}. Raw: ${raw}`);
      return [];
    }
  }
}
