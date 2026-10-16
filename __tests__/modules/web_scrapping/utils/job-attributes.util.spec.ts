import { vagaAttributes } from '../../../../src/modules/web_scrapping/utils/job-attributes.util.js';
import type { VagaResumida } from '../../../../src/modules/ai_chat/services/summarize-job.service.js';

function vaga(overrides: Partial<VagaResumida> = {}): VagaResumida {
  return {
    isTech: true,
    vaga: 'Desenvolvedor Backend',
    senioridade: null,
    escolaridade: null,
    qtdVagas: null,
    cadastroReserva: null,
    remuneração: null,
    moeda: null,
    horasSemanais: null,
    turno: null,
    formato: null,
    modalidade: null,
    cidade: null,
    estado: null,
    duracao: null,
    elegibilidade: null,
    keywords: [],
    ecossystems: [],
    ...overrides,
  };
}

describe('vagaAttributes', () => {
  it('leva os campos da vaga para os da tabela', () => {
    expect(
      vagaAttributes(
        vaga({
          remuneração: 3500.5,
          formato: 'HIBRIDO',
          modalidade: 'CLT',
          senioridade: 'JUNIOR',
          escolaridade: 'GRADUADO',
          cidade: ' Natal ',
          estado: 'RN',
          ecossystems: ['java', 'node'],
        }),
      ),
    ).toEqual({
      ecossytem: 'java, node',
      salary: 3500.5,
      formato: 'HIBRIDO',
      city: 'Natal',
      state: 'RN',
      modelo: 'CLT',
      senioridade: 'JUNIOR',
      escolaridade: 'GRADUADO',
    });
  });

  it('deixa null o que a IA não achou', () => {
    expect(vagaAttributes(vaga({ cidade: '  ', estado: '' }))).toEqual({
      ecossytem: '',
      salary: null,
      formato: null,
      city: null,
      state: null,
      modelo: null,
      senioridade: null,
      escolaridade: null,
    });
  });
});
