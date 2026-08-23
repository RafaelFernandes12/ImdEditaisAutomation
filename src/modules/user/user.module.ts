import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { UserService } from './services/user.service.js';
import { UserEditaisLinkingService } from './services/user-editais-linking.service.js';
import { PdfModule } from '../pdf/pdf.module.js';
import { EditalToUserModule } from '../edital_to_user/edital_to_user.module.js';
import { PdfSendsModule } from '../pdf_sends/pdf_sends.module.js';

@Module({
  imports: [PrismaModule, PdfModule, EditalToUserModule, PdfSendsModule],
  exports: [UserService],
  providers: [
    PrismaService,
    UserRepository,
    UserService,
    UserEditaisLinkingService,
  ],
})
export class UserModule {}
