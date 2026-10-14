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
});
