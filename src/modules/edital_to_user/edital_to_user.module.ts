import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { EditalToUserRepository } from './repositories/edital-to-user.repository.js';
import { EditalToUserService } from './services/edital-to-user.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, EditalToUserRepository, EditalToUserService],
  exports: [EditalToUserService, EditalToUserRepository],
})
export class EditalToUserModule {}
