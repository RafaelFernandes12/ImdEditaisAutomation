import { Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma/prisma.module.js';
import { AiChatController } from './controllers/ai-chat.controller.js';
import { AiChatService } from './services/ai-chat.service.js';
import { AiChatRepository } from './repositories/ai-chat.repository.js';
import { PrismaService } from '../../config/prisma/prisma.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [AiChatController],
  providers: [AiChatService, AiChatRepository, PrismaService],
})
export class AiChatModule {}
