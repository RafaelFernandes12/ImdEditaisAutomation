import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { UserPreferencesData } from '../dto/user.dto.js';

interface CreateUserData {
  chatId: string;
  contact: string;
  name: string;
  preferences: UserPreferencesData;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    { preferences, ...data }: CreateUserData,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await tx.user.create({
      data: {
        ...data,
        UserPreferences: { create: preferences },
      },
    });
    return user;
  }

  async findByChatId(
    chatId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.findUnique({
      where: { chatId },
      include: { sends: true },
    });
  }
  async reactiveUser(
    contact: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.update({
      where: { contact },
      data: { isActive: true },
    });
  }
  async deactiveUser(
    contact: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.update({
      where: { contact },
      data: { isActive: false },
    });
  }
  async findByContact(
    contact: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return await tx.user.findUnique({ where: { contact } });
  }

  async findMany(tx: Prisma.TransactionClient = this.prisma) {
    return await tx.user.findMany({
      include: { sends: true, UserPreferences: true },
      where: { isActive: true },
    });
  }
}
