import { BadRequestException, Injectable } from '@nestjs/common';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { openAIClient } from '../../../config/openai/openai.service.js';
import { ECOSYSTEMS } from '#src/modules/web_scrapping/models/ecossystems.js';
import {
  Escolaridade,
  Formato,
  Modelo,
  Senioridade,
} from '#generated/prisma/enums.js';
import { NewJobPayload } from '#src/modules/web_scrapping/strategy/new-job.strategy.js';

export type VagaResumida = z.infer<SummarizeJob['vaga']>;
export interface ResumoVagas {
  vagas: VagaResumida[];
}

@Injectable()
export class SummarizeJob {
  constructor() {}
  vaga = z.object({
    isTech: z.boolean(),
    vaga: z.string().nullable(),
    senioridade: z.enum(Senioridade).nullable(),
    escolaridade: z.enum(Escolaridade).nullable(),
    qtdVagas: z.number().nullable(),
    cadastroReserva: z.number().nullable(),
    remuneração: z.number().nullable(),
    moeda: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    horasSemanais: z.number().nullable(),
    turno: z
      .enum(['Manhã', 'Tarde', 'Noite', 'Integral', 'Flexível'])
      .nullable(),
    formato: z.enum(Formato).nullable(),
    modalidade: z.enum(Modelo).nullable(),
    cidade: z.string().nullable(),
    estado: z.string().nullable(),
    duracao: z.string().nullable(),
    keywords: z.array(z.string()),
    ecossystems: z.array(z.enum(Object.keys(ECOSYSTEMS))).max(3),
  });
  summarizePrompt = `Você extrai dados estruturados de vagas da área de tecnologia. O texto abaixo pode ser um anúncio de vaga de emprego ou um edital de seleção (bolsas, estágios ou contratações, como os do IMD, da STI e do LAIS da UFRN, ou da FUNPEC).

Preencha um item em "vagas" para cada vaga ou perfil distinto do texto. Se houver uma vaga só, devolva um item só. Informações ditas uma vez para todas as vagas (local, carga horária, duração, vínculo, requisitos gerais...) valem para cada uma delas: repita-as em todos os itens.

Se o texto não for o anúncio de uma vaga (regras do repositório ou do grupo, avisos, comunicados, resultados de seleção, divulgação de eventos ou cursos), devolva "vagas" como lista vazia.

REGRA PRINCIPAL: nunca invente nem deduza valores. Se o texto não informar um campo, use null. Um campo null é sempre melhor que um valor chutado.

COMO PREENCHER CADA CAMPO:
- isTech: true se o trabalho do dia a dia da vaga for de tecnologia: desenvolver, testar, manter ou operar software, dados, infraestrutura ou sistemas (ex: desenvolvimento, QA, dados/BI, IA, DevOps/cloud, segurança da informação, suporte técnico e redes, UI/UX de produtos digitais, embarcados, desenvolvimento de jogos). false se a atividade principal for de outra área, mesmo que a empresa, o setor ou o edital sejam de tecnologia (ex: vendas, comercial, marketing, design gráfico, arte e animação para jogos, atendimento ao cliente sem suporte técnico, administrativo, financeiro, RH, coordenação ou gestão sem atuação técnica). Decida pelas atribuições da vaga, nunca pelos cursos aceitos, pelo nome da empresa ou por ferramentas de escritório (Excel, Notion, Google Sheets, CRM). Em editais com várias vagas, decida separadamente para cada uma.
- vaga: nome curto do cargo ou do perfil, sem a senioridade (ex: "Desenvolvedor Backend", "Bolsista de Desenvolvimento Web"). Se o texto não disser qual é o cargo, use null.
- senioridade: nível exigido do candidato, só se o texto disser explicitamente. Em anúncio de emprego, use "ESTAGIO", "TRAINEE", "JUNIOR", "PLENO", "SENIOR" ou "TECHLEAD" (Tech Lead). Vaga de estágio usa "ESTAGIO" aqui e também em modalidade. Se não achar, devolva null.
- escolaridade: Use o nível acadêmico exigido pelaga vaga: graduandos usam "GRADUACAO"; graduados ou bacharéis, "GRADUADO"; também vale "MESTRADO" ou "DOUTORADO". Se não achar, devolva null
- qtdVagas: número de vagas imediatas. Se o texto não disser quantas, use null.
- cadastroReserva: número de vagas de cadastro reserva. Se não houver ou não disser, use null.
- remuneração: valor mensal do salário ou da bolsa, como número (ex: 3500.5), na moeda em que o texto informar, sem converter. Se for uma faixa, use o menor valor. Se for "a combinar", não informado ou um valor por hora, por dia ou por projeto, use null.
- moeda: código ISO 4217 da moeda da remuneração (ex: "BRL" para real, "USD" para dólar, "EUR" para euro). Se a remuneração for null, use null.
- horasSemanais: carga horária semanal, como número. Se o texto der horas por dia, multiplique por 5.
- turno: "Manhã", "Tarde", "Noite", "Integral" ou "Flexível", só se o texto disser.
- formato: "PRESENCIAL", "HIBRIDO" ou "REMOTO", só se o texto disser. Se não achar, use null.
- modalidade: tipo de vínculo: "CLT", "PJ", "ESTAGIO", "FREELANCE" ou "BOLSISTA" (Se o type do job for IMD ou LAIS, é bolsista). Outro tipo de vínculo usa null.
- cidade: nome da cidade onde a vaga é exercida, sem o estado. Se não achar, use null.
- estado: sigla da UF (ex: "RN", "SP"). Se não achar, use null.
- duracao: duração do contrato ou da bolsa, curta (ex: "12 meses", "6 meses, prorrogável"). Se o texto disser que não tem prazo definido, use "Indeterminado"; se não falar de duração, use null.
- keywords: de 5 a 10 hard skills, tecnologias ou ferramentas pedidas na vaga, com a grafia oficial (ex: "Node.js", "PostgreSQL", "Python"). Não inclua soft skills nem termos genéricos como "programação" ou "tecnologia". Se o texto citar menos de 5, devolva só as citadas.
- ecossystems: derive SOMENTE das keywords que você listou acima, no máximo 3, do mais para o menos relevante. Um ecossistema entra se alguma keyword for um dos termos dele (ignorando maiúsculas, versão e sufixos como ".js": "React.js" → react, "Python 3" → python). Não use o resto do texto e não escolha um ecossistema só por proximidade. Se nenhuma keyword casar, devolva lista vazia. Use só os nomes desta lista (cada nome seguido dos termos que o caracterizam):
${Object.entries(ECOSYSTEMS)
  .map(([key, value]) => `${key}: ${value.terms.join(', ')}`)
  .join('\n')}

Texto:
`;

  async execute(job: NewJobPayload, text: string) {
    try {
      const jobResume = await openAIClient.responses.parse({
        model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
        input: this.summarizePrompt + text + `\n\n\n TIPO DA VAGA:${job.type}`,
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
