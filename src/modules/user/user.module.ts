import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserService } from './services/user.service.js';

@Module({
  imports: [PrismaModule],
  exports: [UserService],
  providers: [PrismaService, UserRepository, UserService],
})
export class UserModule {}
