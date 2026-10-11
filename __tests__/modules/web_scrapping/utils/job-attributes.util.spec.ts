import {
  jobAttributes,
  NAO_INFORMADO,
} from '../../../../src/modules/web_scrapping/utils/job-attributes.util.js';
import { SummarizeJob } from '../../../../src/modules/ai_chat/services/summarize-job.service.js';
import type { VagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job.service.js';

type Attrs = Pick<
  VagaResumida,
  'formato' | 'cidade' | 'estado' | 'modalidade' | 'senioridade'
>;

function attrs(overrides: Partial<Attrs> = {}): Attrs {
  return {
    formato: null,
    cidade: null,
    estado: null,
    modalidade: null,
    senioridade: null,
    ...overrides,
  };
}

describe('jobAttributes', () => {
  it('usa o primeiro valor informado entre as vagas', () => {
    expect(
      jobAttributes({
        vagas: [
          attrs(),
          attrs({ formato: 'Híbrido', cidade: ' Natal ', estado: 'RN' }),
          attrs({ formato: 'Remoto', cidade: 'Recife', estado: 'PE' }),
        ],
      }),
    ).toEqual({
      formato: 'HIBRIDO',
      city: 'Natal',
      state: 'RN',
      modelo: [],
      senioridade: [],
    });
  });

  it('marca como não informado o que a IA não achou', () => {
    expect(jobAttributes({ vagas: [attrs({ cidade: '' })] })).toEqual({
      formato: 'NAO_INFORMADO',
      city: NAO_INFORMADO,
      state: NAO_INFORMADO,
      modelo: [],
      senioridade: [],
    });
  });

  it('junta modelo e senioridade de todas as vagas, sem repetir', () => {
    const { modelo, senioridade } = jobAttributes({
      vagas: [
        attrs({ modalidade: 'CLT', senioridade: 'Júnior' }),
        attrs({ modalidade: 'Estágio', senioridade: 'Estágio' }),
        attrs({ modalidade: 'CLT', senioridade: 'Júnior' }),
      ],
    });

    expect(modelo).toEqual(['CLT', 'ESTAGIO']);
    expect(senioridade).toEqual(['JUNIOR', 'ESTAGIO']);
  });

  it('entende os níveis acadêmicos e a bolsa do edital', () => {
    const { modelo, senioridade } = jobAttributes({
      vagas: [
        attrs({ modalidade: 'Bolsista', senioridade: 'Graduação' }),
        attrs({ modalidade: 'CLT', senioridade: 'Mestrado' }),
      ],
    });

    expect(modelo).toEqual(['BOLSISTA', 'CLT']);
    expect(senioridade).toEqual(['GRADUACAO', 'MESTRADO']);
  });

  // Rótulo do prompt diferente do de preferences.ts se perderia em silêncio.
  it('converte todo rótulo que o prompt aceita', () => {
    const { shape } = new SummarizeJob().vaga;

    for (const formato of shape.formato.unwrap().options) {
      expect(jobAttributes({ vagas: [attrs({ formato })] }).formato).not.toBe(
        'NAO_INFORMADO',
      );
    }
    for (const modalidade of shape.modalidade.unwrap().options) {
      expect(
        jobAttributes({ vagas: [attrs({ modalidade })] }).modelo,
      ).toHaveLength(1);
    }
    for (const senioridade of shape.senioridade.unwrap().options) {
      expect(
        jobAttributes({ vagas: [attrs({ senioridade })] }).senioridade,
      ).toHaveLength(1);
    }
  });
});
