import { BadRequestException, Injectable } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { openAIClient } from '../../../config/openai/openai.service.js';
import { ECOSYSTEMS } from '#src/modules/web_scrapping/models/ecossystems.js';

export type VagaResumida = z.infer<SummarizeJob['vaga']>;
export interface ResumoVagas {
  vagas: VagaResumida[];
}

@Injectable()
export class SummarizeJob {
  constructor() {}
  vaga = z.object({
    vaga: z.string(),
    senioridade: z
      .enum([
        'Estágio',
        'Trainee',
        'Júnior',
        'Pleno',
        'Sênior',
        'Tech Lead',
        'Graduação',
        'Graduado',
        'Mestrado',
        'Doutorado',
      ])
      .nullable(),
    qtdVagas: z.number().nullable(),
    cadastroReserva: z.number().nullable(),
    remuneração: z.number().nullable(),
    horasSemanais: z.number().nullable(),
    turno: z
      .enum(['Manhã', 'Tarde', 'Noite', 'Integral', 'Flexível'])
      .nullable(),
    formato: z.enum(['Presencial', 'Híbrido', 'Remoto']).nullable(),
    modalidade: z
      .enum(['CLT', 'PJ', 'Estágio', 'Freelance', 'Bolsista'])
      .nullable(),
    cidade: z.string().nullable(),
    estado: z.string().nullable(),
    duracao: z.string().nullable(),
    elegibilidade: z.string().nullable(),
    keywords: z.array(z.string()),
    ecossystems: z.string(),
  });
  summarizePrompt = `Você extrai dados estruturados de vagas da área de tecnologia. O texto abaixo pode ser um anúncio de vaga de emprego ou um edital de seleção (bolsas, estágios ou contratações, como os do IMD e da STI da UFRN).

Preencha um item em "vagas" para cada vaga ou perfil distinto do texto. Se houver uma vaga só, devolva um item só. Informações ditas uma vez para todas as vagas (local, carga horária, duração, vínculo, requisitos gerais...) valem para cada uma delas: repita-as em todos os itens.

REGRA PRINCIPAL: nunca invente nem deduza valores. Se o texto não informar um campo, use null. Um campo null é sempre melhor que um valor chutado.

COMO PREENCHER CADA CAMPO:
- vaga: nome curto do cargo ou do perfil, sem a senioridade (ex: "Desenvolvedor Backend", "Bolsista de Desenvolvimento Web").
- senioridade: nível exigido do candidato, só se o texto disser explicitamente. Em anúncio de emprego, use "Estágio", "Trainee", "Júnior", "Pleno", "Sênior" ou "Tech Lead". Em edital, use o nível acadêmico: graduandos usam "Graduação"; graduados ou bacharéis, "Graduado"; também vale "Mestrado" ou "Doutorado". Vaga de estágio usa "Estágio" aqui e também em modalidade.
- qtdVagas: número de vagas imediatas. Se o texto não disser quantas, use null.
- cadastroReserva: número de vagas de cadastro reserva. Se não houver ou não disser, use null.
- remuneração: valor mensal do salário ou da bolsa em reais, como número (ex: 3500.5). Se for uma faixa, use o menor valor. Se for "a combinar" ou não informado, use null.
- horasSemanais: carga horária semanal, como número. Se o texto der horas por dia, multiplique por 5.
- turno: "Manhã", "Tarde", "Noite", "Integral" ou "Flexível", só se o texto disser.
- formato: "Presencial", "Híbrido" ou "Remoto".
- modalidade: tipo de vínculo: "CLT", "PJ", "Estágio", "Freelance" ou "Bolsista" (bolsa de projeto, pesquisa, extensão ou monitoria). Outro tipo de vínculo usa null.
- cidade: nome da cidade onde a vaga é exercida, sem o estado.
- estado: sigla da UF (ex: "RN", "SP").
- duracao: duração do contrato ou da bolsa, curta (ex: "12 meses", "6 meses, prorrogável"). Se o texto disser que não tem prazo definido, use "Indeterminado"; se não falar de duração, use null.
- elegibilidade: requisitos obrigatórios para se candidatar, em uma frase curta (ex: "Graduandos do BTI com IRA a partir de 6", "3 anos de experiência com Node.js"). Não liste requisitos desejáveis nem diferenciais.
- keywords: de 5 a 10 hard skills, tecnologias ou ferramentas pedidas na vaga, com a grafia oficial (ex: "Node.js", "PostgreSQL", "Python"). Não inclua soft skills nem termos genéricos como "programação" ou "tecnologia". Se o texto citar menos de 5, devolva só as citadas.
- ecossystems: ecossistemas aos quais a vaga pertence, separados por vírgula, usando só os nomes desta lista (cada nome seguido dos termos que o caracterizam):
${Object.values(ECOSYSTEMS)
  .map((eco) => `${eco.label}: ${eco.terms.join(', ')}`)
  .join('\n')}

Texto:
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
