import { SummarizeJob } from '../../../src/modules/ai_chat/services/summarize-job.service.js';

describe('SummarizeJob', () => {
  // Valor do enum que o prompt não cita a IA nunca escolhe (ou chuta outro).
  it('cita no prompt todo valor que o schema aceita', () => {
    const { summarizePrompt, vaga } = new SummarizeJob();
    const { formato, modalidade, senioridade } = vaga.shape;

    for (const field of [formato, modalidade, senioridade]) {
      for (const value of field.unwrap().options) {
        expect(summarizePrompt).toContain(`"${value}"`);
      }
    }
  });

  // A senioridade costuma estar só no título ("Desenvolvedor Java SR").
  it('manda o título da vaga junto com o texto', () => {
    const service = new SummarizeJob();

    const input = service.buildInput(
      {
        title: 'DESENVOLVEDOR FULLSTACK SR',
        type: 'GUPY',
        link: 'https://empresa.gupy.io/job/1',
        description: 'Somos uma empresa de software.',
        isActive: true,
      },
      'Somos uma empresa de software.',
    );

    expect(input).toContain(
      'Título: DESENVOLVEDOR FULLSTACK SR\n\nSomos uma empresa de software.',
    );
    expect(input.startsWith(service.summarizePrompt)).toBe(true);
    expect(input).toContain('TIPO DA VAGA:GUPY');
  });
});
