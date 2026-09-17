import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';

@Injectable()
export class UserSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}
}
