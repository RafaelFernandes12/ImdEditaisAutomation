import {
  assertCoversAllJobTypes,
  JobSource,
} from '../../../../src/modules/web_scrapping/sources/job.source.js';
import { JobType } from '../../../../generated/prisma/enums.js';

function source(name: string, types: JobType[]): JobSource {
  return {
    name,
    types,
    weight: [],
    list: jest.fn(),
    fetchDetails: jest.fn(),
  };
}

const ALL_COVERED = [
  source('imd', ['IMD']),
  source('sti', ['STI']),
  source('jerimum', ['JERIMUM']),
  source('github', ['BACKEND_GITHUB', 'FRONTEND_GITHUB']),
  source('lais', ['LAIS']),
  source('funpec', ['FUNPEC']),
  source('ect', ['ECT']),
  source('gupy', ['GUPY']),
  source('linkedin', ['LINKEDIN']),
  source('infojobs', ['INFOJOBS']),
  source('solides', ['SOLIDES']),
  source('bne', ['BNE']),
  source('senior', ['SENIOR']),
];

describe('assertCoversAllJobTypes', () => {
  it('devolve as fontes quando cada tipo tem exatamente uma', () => {
    expect(assertCoversAllJobTypes(ALL_COVERED)).toBe(ALL_COVERED);
  });

  it('lança quando um tipo fica sem fonte', () => {
    expect(() =>
      assertCoversAllJobTypes(ALL_COVERED.filter((s) => s.name !== 'sti')),
    ).toThrow('STI sem fonte');
  });

  it('lança quando um tipo está em mais de uma fonte', () => {
    expect(() =>
      assertCoversAllJobTypes([...ALL_COVERED, source('outra', ['IMD'])]),
    ).toThrow('IMD em várias fontes (imd, outra)');
  });

  it('lista todos os problemas de uma vez', () => {
    expect(() =>
      assertCoversAllJobTypes([
        source('imd', ['IMD']),
        source('outra', ['IMD']),
      ]),
    ).toThrow(
      'Registro de fontes inválido: IMD em várias fontes (imd, outra); JERIMUM sem fonte; STI sem fonte; BACKEND_GITHUB sem fonte; FRONTEND_GITHUB sem fonte',
    );
  });
});
