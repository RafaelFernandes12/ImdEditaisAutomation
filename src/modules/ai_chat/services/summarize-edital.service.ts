import { Injectable } from '@nestjs/common';
import { openAIClient } from '../../../config/openai/openai.service.js';

@Injectable()
export class SummarizeEdital {
  constructor() {}
  summarizePrompt = `Atue como um redator de vagas de emprego focado em comunicação ultradireta para WhatsApp. Seu objetivo é resumir as oportunidades do PDF em formato compacto, sem enrolação.

REGRAS DE CONTEÚDO:
1. Agrupe no topo todas as informações que forem comuns a todas as vagas (ex: Modelo, Carga horária, Local, Elegibilidade geral).
2. Corte saudações, introduções, adjetivos e despedidas. Entregue APENAS o texto final pronto para envio.

REGRAS RÍGIDAS DE FORMATAÇÃO (MANDATÓRIO):
- Não pule linhas entre os campos de uma mesma vaga (use quebra de linha simples, uma linha imediatamente abaixo da outra, sem linhas em branco/vazias entre elas).
- Não adicione espaços extras no final das linhas ou do texto.
- Siga exatamente este formato para cada vaga:

*Vaga:* [Nome da Vaga]
*Qtd vagas:* [Número][+ qtd CR se houver]
*Remuneração:* [R$ Valor] ([X]h semanais / [Turno] / [Presencial/Híbrido/Remoto])
*Palavras-chaves:* [5 a 10 hard skills/tecnologias/ferramentas separadas por vírgula]
*Duração:* [Tempo de contrato ou "Indeterminado"]
*Elegibilidade:* [Requisitos específicos obrigatórios]

(Separe apenas uma vaga da outra com 1 linha em branco).

Aqui está o PDF:
`;

  async execute(pdfText: string) {
    const editalResume = await openAIClient.responses.create({
      model: 'gpt-4o-mini',
      input: this.summarizePrompt + pdfText,
    });

    return editalResume.output_text;
  }
}
