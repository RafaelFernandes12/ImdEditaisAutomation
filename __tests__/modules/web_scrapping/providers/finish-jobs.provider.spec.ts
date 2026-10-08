jest.mock('../../../../src/modules/jobs/services/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));

import { FinishJobsProvider } from '../../../../src/modules/web_scrapping/providers/finish-jobs.provider.js';
import type {
  JobSource,
  ListedJob,
} from '../../../../src/modules/web_scrapping/sources/job.source.js';
import type {
  ActiveJob,
  JobsService,
} from '../../../../src/modules/jobs/services/jobs.service.js';
import type { PinoLogger } from 'nestjs-pino';
import { JobType } from '../../../../generated/prisma/enums.js';

function listed(type: JobType, link: string): ListedJob {
  return { type, link };
}

function active(id: number, type: JobType, link: string) {
  return { id, type, link } as unknown as ActiveJob;
}

function fakeSource(
  overrides: Partial<JobSource> & Pick<JobSource, 'name' | 'types'>,
): JobSource {
  return {
    list: jest.fn().mockResolvedValue([]),
    fetchDetails: jest.fn(),
    ...overrides,
  };
}

describe('FinishJobsProvider', () => {
  let jobsService: jest.Mocked<
    Pick<JobsService, 'findActiveByTypes' | 'deactivateMany'>
  >;
  let logger: jest.Mocked<
    Pick<PinoLogger, 'info' | 'warn' | 'debug' | 'error'>
  >;

  function provider(sources: JobSource[]) {
    return new FinishJobsProvider(
      jobsService as unknown as JobsService,
      sources,
      logger as unknown as PinoLogger,
    );
  }

  beforeEach(() => {
    jobsService = {
      findActiveByTypes: jest.fn().mockResolvedValue([]),
      deactivateMany: jest.fn().mockResolvedValue(undefined),
    };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('encerramento padrão (sumiu da listagem)', () => {
    it('encerra as vagas ativas da fonte que sumiram da listagem', async () => {
      const source = fakeSource({
        name: 'sti',
        types: ['STI'],
        list: jest.fn().mockResolvedValue([listed('STI', 'a')]),
      });
      jobsService.findActiveByTypes.mockResolvedValue([
        active(1, 'STI', 'a'),
        active(2, 'STI', 'b'),
      ]);

      await provider([source]).execute();

      expect(jobsService.findActiveByTypes).toHaveBeenCalledWith(['STI']);
      expect(jobsService.deactivateMany).toHaveBeenCalledWith([{ id: 2 }]);
    });

    it('não encerra nada quando a listagem vem vazia e há vagas ativas', async () => {
      const source = fakeSource({ name: 'jerimum', types: ['JERIMUM'] });
      jobsService.findActiveByTypes.mockResolvedValue([
        active(1, 'JERIMUM', 'a'),
      ]);

      await provider([source]).execute();

      expect(jobsService.deactivateMany).toHaveBeenCalledWith([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'cron.finish_jobs.listing_empty',
          source: 'jerimum',
          type: 'JERIMUM',
          activeInDb: 1,
        }),
        expect.any(String),
      );
    });

    it('não avisa quando a listagem vem vazia e não há vagas ativas', async () => {
      const source = fakeSource({ name: 'jerimum', types: ['JERIMUM'] });

      await provider([source]).execute();

      expect(jobsService.deactivateMany).toHaveBeenCalledWith([]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('pula só o tipo cuja listagem veio vazia', async () => {
      const source = fakeSource({
        name: 'github',
        types: ['BACKEND_GITHUB', 'FRONTEND_GITHUB'],
        list: jest
          .fn()
          .mockResolvedValue([listed('FRONTEND_GITHUB', 'f-aberta')]),
      });
      jobsService.findActiveByTypes.mockResolvedValue([
        active(1, 'BACKEND_GITHUB', 'b-fechada'),
        active(2, 'FRONTEND_GITHUB', 'f-fechada'),
        active(3, 'FRONTEND_GITHUB', 'f-aberta'),
      ]);

      await provider([source]).execute();

      expect(jobsService.deactivateMany).toHaveBeenCalledWith([{ id: 2 }]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'cron.finish_jobs.listing_empty',
          type: 'BACKEND_GITHUB',
        }),
        expect.any(String),
      );
    });
  });

  it('usa o findFinished quando a fonte tem encerramento próprio', async () => {
    const list = jest.fn();
    const findFinished = jest
      .fn()
      .mockResolvedValue([{ id: 7, validUntil: 12 }]);
    const source = fakeSource({
      name: 'imd',
      types: ['IMD'],
      list,
      findFinished,
    });
    const activeImd = [active(7, 'IMD', 'x')];
    jobsService.findActiveByTypes.mockResolvedValue(activeImd);

    await provider([source]).execute();

    expect(findFinished).toHaveBeenCalledWith(activeImd);
    expect(list).not.toHaveBeenCalled();
    expect(jobsService.deactivateMany).toHaveBeenCalledWith([
      { id: 7, validUntil: 12 },
    ]);
  });

  it('isola a falha de uma fonte e lança no fim com o nome dela', async () => {
    const boom = new Error('site fora do ar');
    const broken = fakeSource({
      name: 'jerimum',
      types: ['JERIMUM'],
      list: jest.fn().mockRejectedValue(boom),
    });
    const healthy = fakeSource({
      name: 'sti',
      types: ['STI'],
      list: jest.fn().mockResolvedValue([listed('STI', 'a')]),
    });
    jobsService.findActiveByTypes.mockImplementation((types) =>
      Promise.resolve(
        types.includes('STI')
          ? [active(1, 'STI', 'a'), active(2, 'STI', 'b')]
          : [],
      ),
    );

    await expect(provider([broken, healthy]).execute()).rejects.toThrow(
      'jerimum',
    );

    expect(jobsService.deactivateMany).toHaveBeenCalledTimes(1);
    expect(jobsService.deactivateMany).toHaveBeenCalledWith([{ id: 2 }]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        evt: 'cron.finish_jobs.source_failed',
        source: 'jerimum',
        err: boom,
      }),
      expect.any(String),
    );
  });
});
