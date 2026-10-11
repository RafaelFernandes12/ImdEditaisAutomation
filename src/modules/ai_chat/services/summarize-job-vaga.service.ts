import { BadRequestException, Injectable } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { openAIClient } from '../../../config/openai/openai.service.js';

export type VagaResumida = z.infer<SummarizeJobVaga['vaga']>;
export interface ResumoVagas {
  vagas: VagaResumida[];
}

@Injectable()
export class SummarizeJobVaga {
  constructor() {}
  vaga = z.object({
    vaga: z.string(),
    senioridade: z
      .enum(['Júnior', 'Pleno', 'Sênior', 'Tech Lead', 'Não informado'])
      .nullable(),
    qtdVagas: z.number().nullable(),
    remuneração: z.number().nullable(),
    horasSemanais: z.number().nullable(),
    formato: z.enum(['Presencial', 'Híbrido', 'Remoto']).nullable(),
    modalidade: z.enum(['PJ', 'CLT', 'Estágio', 'Freelance']).nullable(),
    cidade: z.string().nullable(),
    estado: z.string().nullable(),
    keywords: z.array(z.string()),
  });
  summarizePrompt = `Você extrai dados estruturados de anúncios de vagas de emprego na área de tecnologia.

Leia o texto da vaga abaixo e preencha um item em "vagas" para cada vaga distinta do anúncio. Se o anúncio tiver uma vaga só, devolva um item só. Informações ditas uma vez para todas as vagas (local, carga horária, modalidade...) valem para cada uma delas: repita-as em todos os itens.

REGRA PRINCIPAL: nunca invente nem deduza valores. Se o texto não informar um campo, use null. Um campo null é sempre melhor que um valor chutado.

COMO PREENCHER CADA CAMPO:
- vaga: nome curto do cargo, sem a senioridade (ex: "Desenvolvedor Backend", "Analista de Dados").
- senioridade: só se o texto disser explicitamente. Vaga de estágio usa null aqui (o estágio vai em modalidade).
- qtdVagas: número de vagas imediatas. Se o texto não disser quantas, use null.
- remuneração: valor mensal em reais, como número (ex: 3500.5). Se for uma faixa, use o menor valor. Se for "a combinar" ou não informado, use null.
- horasSemanais: carga horária semanal, como número. Se o texto der horas por dia, multiplique por 5.
- formato: "Presencial", "Híbrido" ou "Remoto".
- modalidade: "CLT", "PJ", "Estágio" e "Freelance". Outro tipo de contrato usa null.
- cidade: nome da cidade, sem o estado.
- estado: sigla da UF (ex: "RN", "SP").
- keywords: de 5 a 10 hard skills, tecnologias ou ferramentas pedidas na vaga, com a grafia oficial (ex: "Node.js", "PostgreSQL", "React"). Não inclua soft skills nem termos genéricos como "programação" ou "tecnologia". Se o texto citar menos de 5, devolva só as citadas.

Texto da vaga:
`;

  async execute(text: string) {
    try {
      const jobResume = await openAIClient.responses.parse({
        model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
        input: this.summarizePrompt + text,
        text: {
          format: zodTextFormat(
            z.object({ vagas: z.array(this.vaga) }),
            'resumo_vagas',
          ),
        },
      });

      if (!jobResume.output_parsed) {
        throw new Error('A IA não devolveu o resumo estruturado da vaga');
      }
      return jobResume.output_parsed;
    } catch (e) {
      throw new BadRequestException(e);
    }
  }
}
