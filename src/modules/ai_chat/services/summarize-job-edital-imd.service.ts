import { BadRequestException, Injectable } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { openAIClient } from '../../../config/openai/openai.service.js';

export type EditalVagaResumida = z.infer<SummarizeJobEditalImd['vaga']>;
export interface ResumoEdital {
  vagas: EditalVagaResumida[];
}

@Injectable()
export class SummarizeJobEditalImd {
  constructor() {}
  vaga = z.object({
    vaga: z.string(),
    qtdVagas: z.number().nullable(),
    cadastroReserva: z.number().nullable(),
    remuneração: z.number().nullable(),
    horasSemanais: z.number().nullable(),
    turno: z
      .enum(['Manhã', 'Tarde', 'Noite', 'Integral', 'Flexível'])
      .nullable(),
    formato: z.enum(['Presencial', 'Híbrido', 'Remoto']).nullable(),
    duracao: z.string().nullable(),
    elegibilidade: z.string().nullable(),
    keywords: z.array(z.string()),
  });
  summarizePrompt = `Você extrai dados estruturados de editais de seleção de bolsistas e vagas da área de tecnologia (IMD e STI da UFRN).

Leia o texto do edital abaixo e preencha um item em "vagas" para cada vaga ou perfil de bolsa distinto do edital. Informações ditas uma vez para todas as vagas (carga horária, duração, requisitos gerais...) valem para cada uma delas: repita-as em todos os itens.

REGRA PRINCIPAL: nunca invente nem deduza valores. Se o edital não informar um campo, use null. Um campo null é sempre melhor que um valor chutado.

COMO PREENCHER CADA CAMPO:
- vaga: nome curto da vaga ou do perfil (ex: "Bolsista de Desenvolvimento Web", "Bolsista de Suporte").
- qtdVagas: número de vagas imediatas. Se o edital não disser quantas, use null.
- cadastroReserva: número de vagas de cadastro reserva. Se não houver ou não disser, use null.
- remuneração: valor mensal da bolsa ou do salário em reais, como número (ex: 700). Se for uma faixa, use o menor valor.
- horasSemanais: carga horária semanal, como número. Se o edital der horas por dia, multiplique por 5.
- turno: "Manhã", "Tarde", "Noite", "Integral" ou "Flexível", só se o edital disser.
- formato: "Presencial", "Híbrido" ou "Remoto".
- duracao: duração da bolsa ou do contrato, curta (ex: "12 meses", "6 meses, prorrogável"). Se não tiver prazo definido, use "Indeterminado".
- elegibilidade: requisitos obrigatórios para se inscrever, em uma frase curta (ex: "Graduandos do BTI com IRA a partir de 6"). Não liste requisitos desejáveis.
- keywords: de 5 a 10 hard skills, tecnologias ou ferramentas pedidas na vaga, com a grafia oficial (ex: "Python", "Django", "Git"). Não inclua soft skills nem termos genéricos como "programação" ou "tecnologia". Se o edital citar menos de 5, devolva só as citadas.

Texto do edital:
`;

  async execute(pdfText: string) {
    try {
      const jobResume = await openAIClient.responses.parse({
        model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
        input: this.summarizePrompt + pdfText,
        text: {
          format: zodTextFormat(
            z.object({ vagas: z.array(this.vaga) }),
            'resumo_edital',
          ),
        },
      });

      if (!jobResume.output_parsed) {
        throw new Error('A IA não devolveu o resumo estruturado do edital');
      }
      return jobResume.output_parsed;
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
