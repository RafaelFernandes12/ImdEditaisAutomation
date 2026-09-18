import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { CreateJob } from '../dto/jobs.dto.js';

const activeJobInclude = {
  edital: { include: { pdfs: true } },
  jerimum: true,
} satisfies Prisma.JobInclude;

export type ActiveJob = Prisma.JobGetPayload<{
  include: typeof activeJobInclude;
}>;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(data: CreateJob, tx: Prisma.TransactionClient = this.prisma) {
    const child =
      'edital' in data
        ? { edital: { create: data.edital } }
        : { jerimum: { create: data.jerimum } };

    const job = await tx.job.upsert({
      where: { title: data.title },
      create: {
        title: data.title,
        type: data.type,
        link: data.link,
        isActive: data.isActive,
        summary: data.summary,
        keyWords: data.keyWords,
        ...child,
      },
      update: { title: data.title },
      include: { edital: true, jerimum: true },
    });

    return job;
  }
  async findManyByLink(
    links: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const jobs = await tx.job.findMany({
      where: { link: { in: links } },
    });
    return jobs;
  }
  async findActive(
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<ActiveJob[]> {
    const jobs = await tx.job.findMany({
      where: { isActive: true },
      include: activeJobInclude,
      orderBy: [{ edital: { subscriptionUntil: 'desc' } }, { id: 'desc' }],
    });
    return jobs;
  }

  async deactivateMany(
    data: {
      id: number;
      validUntil?: number;
    }[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const jobs = await Promise.all(
      data.map(async (d) => {
        const job = await tx.job.update({
          where: { id: d.id },
          data: {
            isActive: false,
            finishedAt: new Date(),
          },
        });

        // updateMany é no-op quando o job não tem filho Edital (ex.: jerimum),
        // enquanto `edital: { update: ... }` aninhado lançaria P2025.
        if (d.validUntil !== undefined && !Number.isNaN(d.validUntil)) {
          await tx.edital.updateMany({
            where: { jobId: d.id },
            data: {
              validUntil: new Date(
                new Date().setMonth(new Date().getMonth() + d.validUntil),
              ),
            },
          });
        }

        return job;
      }),
    );
    return jobs;
  }
}
