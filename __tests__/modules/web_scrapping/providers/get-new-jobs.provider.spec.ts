jest.mock('../../../../src/modules/jobs/services/jobs.service.js', () => ({
  JobsService: class JobsService {},
}));

import { GetNewJobsProvider } from '../../../../src/modules/web_scrapping/providers/get-new-jobs.provider.js';
import type {
  JobSource,
  ListedJob,
} from '../../../../src/modules/web_scrapping/sources/job.source.js';
import type { JobsService } from '../../../../src/modules/jobs/services/jobs.service.js';
import type { NewJobPayload } from '../../../../src/modules/web_scrapping/strategy/new-job.strategy.js';
import type { FlowProducer } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { JobType } from '../../../../generated/prisma/enums.js';

function listed(type: JobType, link: string): ListedJob {
  return { type, link };
}

// O detalhe de cada vaga listada é o próprio item marcado, para os testes
// enxergarem o que chegou ao fetchDetails e à fila.
function fakeSource(name: string, types: JobType[], jobs: ListedJob[]) {
  const list = jest.fn().mockResolvedValue(jobs);
  const fetchDetails = jest
    .fn()
    .mockImplementation((toFetch: ListedJob[]) =>
      Promise.resolve(toFetch.map((job) => ({ ...job, detailed: true }))),
    );
  const source: JobSource = { name, types, weight: [], list, fetchDetails };
  return Object.assign(source, { mocks: { list, fetchDetails } });
}

describe('GetNewJobsProvider', () => {
  let jobsService: jest.Mocked<Pick<JobsService, 'findManyByLink'>>;
  let flowProducer: jest.Mocked<Pick<FlowProducer, 'add'>>;
  let logger: jest.Mocked<
    Pick<PinoLogger, 'info' | 'warn' | 'debug' | 'error'>
  >;

  function provider(sources: JobSource[]) {
    return new GetNewJobsProvider(
      jobsService as unknown as JobsService,
      flowProducer as unknown as FlowProducer,
      logger as unknown as PinoLogger,
      sources,
    );
  }

  /** Payloads enfileirados na getNewJobs pelo último execute(). */
  function enqueued(): NewJobPayload[] {
    const [flow] = flowProducer.add.mock.calls[0];
    return (flow.children ?? [])
      .filter((child) => child.queueName === 'getNewJobs')
      .map((child) => child.data as NewJobPayload);
  }

  beforeEach(() => {
    jobsService = { findManyByLink: jest.fn().mockResolvedValue([]) };
    flowProducer = { add: jest.fn().mockResolvedValue(undefined) };
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    };
  });

  describe('collect', () => {
    it('descarta as vagas já gravadas antes de buscar o detalhe', async () => {
      const source = fakeSource(
        'jerimum',
        ['JERIMUM'],
        [listed('JERIMUM', 'a'), listed('JERIMUM', 'b')],
      );
      jobsService.findManyByLink.mockResolvedValue([{ link: 'a' }] as never);

      await provider([source]).collect(source);

      expect(jobsService.findManyByLink).toHaveBeenCalledWith(['a', 'b']);
      expect(source.mocks.fetchDetails).toHaveBeenCalledWith([
        listed('JERIMUM', 'b'),
      ]);
    });

    it('não descarta edital já gravado, que volta para pegar PDFs novos', async () => {
      const source = fakeSource('imd', ['IMD'], [listed('IMD', 'x')]);

      await provider([source]).collect(source);

      expect(jobsService.findManyByLink).not.toHaveBeenCalled();
      expect(source.mocks.fetchDetails).toHaveBeenCalledWith([
        listed('IMD', 'x'),
      ]);
    });
  });

  describe('execute', () => {
    it('enfileira o detalhe das vagas de todas as fontes e o finishJobs', async () => {
      await provider([
        fakeSource('imd', ['IMD'], [listed('IMD', 'x')]),
        fakeSource('jerimum', ['JERIMUM'], [listed('JERIMUM', 'a')]),
      ]).execute();

      expect(enqueued()).toEqual([
        { type: 'IMD', link: 'x', detailed: true },
        { type: 'JERIMUM', link: 'a', detailed: true },
      ]);
      expect(flowProducer.add).toHaveBeenCalledWith(
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({ queueName: 'finishJobs' }),
          ]) as unknown,
        }),
      );
    });

    it('isola a falha de uma fonte e segue com as outras', async () => {
      const boom = new Error('site fora do ar');
      const broken = fakeSource('jerimum', ['JERIMUM'], []);
      broken.mocks.list.mockRejectedValue(boom);

      await provider([
        broken,
        fakeSource('sti', ['STI'], [listed('STI', 's')]),
      ]).execute();

      expect(enqueued()).toEqual([{ type: 'STI', link: 's', detailed: true }]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'cron.get_new_jobs.source_failed',
          source: 'jerimum',
          err: boom,
        }),
        expect.any(String),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          evt: 'cron.get_new_jobs.done',
          failed: ['jerimum'],
        }),
        expect.any(String),
      );
    });
  });
});
