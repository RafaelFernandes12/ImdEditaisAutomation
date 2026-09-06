import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserService } from './services/user.service.js';
import { UserEditaisLinkingService } from './services/user-editais-linking.service.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { SendsModule } from '../sends/sends.module.js';

@Module({
  imports: [PrismaModule, PdfModule, SendsModule],
  exports: [UserService],
  providers: [
    PrismaService,
    UserRepository,
    UserService,
    UserEditaisLinkingService,
  ],
})
export class UserModule {}
