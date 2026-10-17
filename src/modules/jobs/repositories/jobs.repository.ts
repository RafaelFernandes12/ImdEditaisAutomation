import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { JobType, Prisma } from '../../../../generated/prisma/client.js';
import { CreateJob } from '../dto/jobs.dto.js';
import { JOB_TYPES } from '../job-types.js';

const activeJobInclude = {
  // O primeiro pdf é o edital em si (o link enviado nas vagas do edital).
  pdfs: { orderBy: { id: 'asc' } },
  vagas: { orderBy: { id: 'asc' } },
} satisfies Prisma.JobInclude;

export type ActiveJob = Prisma.JobGetPayload<{
  include: typeof activeJobInclude;
}>;

@Injectable()
export class JobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createJob(data: CreateJob, tx: Prisma.TransactionClient = this.prisma) {
    const { vagas, pdfs = [], ...job } = data;
    return await tx.job.upsert({
      where: { link: data.link },
      create: {
        ...job,
        kind: JOB_TYPES[data.type].kind,
        pdfs: { create: pdfs },
        vagas: { create: vagas },
      },
      update: { title: data.title, pdfs: { create: pdfs } },
      include: { pdfs: true },
    });
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
    stillActive: boolean,
    types?: JobType[],
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<ActiveJob[]> {
    const jobs = await tx.job.findMany({
      where: {
        isActive: true,
        ...(types && { type: { in: types } }),
        ...(stillActive && {
          OR: [
            { subscriptionUntil: { gt: new Date() } },
            { subscriptionUntil: null },
          ],
        }),
      },
      include: activeJobInclude,
      orderBy: [{ subscriptionUntil: 'desc' }, { id: 'desc' }],
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
      data.map((d) =>
        tx.job.update({
          where: { id: d.id },
          data: {
            isActive: false,
            finishedAt: new Date(),
            ...(d.validUntil !== undefined &&
              !Number.isNaN(d.validUntil) && {
                validUntil: new Date(
                  new Date().setMonth(new Date().getMonth() + d.validUntil),
                ),
              }),
          },
        }),
      ),
    );
    return jobs;
  }
}
