import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../config/prisma/prisma.service.js';

@Injectable()
export class AiChatRepository {
  constructor(private prisma: PrismaService) {}

  async createAiConversation(conversationId: string) {
    return await this.prisma.aiChat.create({
      data: { conversationId, conversation: [], title: '' },
    });
  }

  async updateChatTitle(conversationId: string, title: string) {
    return await this.prisma.aiChat.update({
      where: { conversationId },
      data: { title },
    });
  }
  async updateAiConversation(
    conversationId: string,
    conversation: { user: string; chat: string }[],
  ) {
    return await this.prisma.aiChat.update({
      where: { conversationId },
      data: { conversation },
    });
  }
  async getAiConversation(conversationId?: string) {
    return await this.prisma.aiChat.findUnique({
      where: { conversationId },
    });
  }
  async getAllConversation() {
    return await this.prisma.aiChat.findMany({
      orderBy: { updated_at: 'desc' },
    });
  }
}
