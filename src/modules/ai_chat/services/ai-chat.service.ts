import { Injectable, NotFoundException } from '@nestjs/common';
import { AiChatRepository } from '../repositories/ai-chat.repository.js';
import { openAIClient } from '../../../config/openai/openai.service.js';
import { Conversation, StartChat } from '../dto/ai-chat.dto.js';

@Injectable()
export class AiChatService {
  constructor(private aiChatRepository: AiChatRepository) {}

  async initNewChat() {
    const conversation = await openAIClient.conversations.create();
    const chat = await this.aiChatRepository.createAiConversation(
      conversation.id,
    );

    return chat;
  }

  async getChats() {
    return this.aiChatRepository.getAllConversation();
  }

  async startChat(initChat: StartChat) {
    const chat = await openAIClient.responses.create({
      model: 'gpt-4o-mini',
      input: initChat.message,
      conversation: initChat.conversationId,
    });

    const previousConversation = await this.aiChatRepository.getAiConversation(
      initChat.conversationId,
    );

    const conv =
      previousConversation?.conversation as unknown as Conversation[];

    conv.push({ user: initChat.message, chat: chat.output_text });

    const updatedChat = await this.aiChatRepository.updateAiConversation(
      initChat.conversationId,
      conv,
    );

    return {
      ...updatedChat,
      message: chat.output_text,
    };
  }

  async updateChatTitle(conversationId: string) {
    console.log('CONVERSATIONID', conversationId);
    const conversation =
      await this.aiChatRepository.getAiConversation(conversationId);

    if (!conversation) throw new NotFoundException('Conversa nao encontrada');

    const transcript = (conversation.conversation as unknown as Conversation[])
      .map((c) => `Usuário: ${c.user}\nbot: ${c.chat}`)
      .join('\n\n');

    const chat = await openAIClient.responses.create({
      model: 'gpt-4o-mini',
      input:
        'Dê um nome para essa conversa, o seu output deve ser SOMENTE O TITULO DA CONVERSA:\n' +
        transcript,
    });
    console.log('CHAT', chat.output_text);
    await this.aiChatRepository.updateChatTitle(
      conversationId,
      chat.output_text,
    );
  }
}
