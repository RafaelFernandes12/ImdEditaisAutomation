import { Body, Controller, Get, Post } from '@nestjs/common';
import { AiChatService } from '../services/ai-chat.service.js';
import { StartChat } from '../dto/ai-chat.dto.js';

@Controller('chat')
export class AiChatController {
  constructor(private readonly aiChat: AiChatService) {}

  @Post('/new')
  async initNewChat() {
    return this.aiChat.initNewChat();
  }

  @Post('/conversation')
  async startChat(@Body() initChat: StartChat) {
    return this.aiChat.startChat(initChat);
  }

  @Post('/updateChatTitle')
  async updateChatTitle(@Body('conversationId') conversationId: string) {
    return this.aiChat.updateChatTitle(conversationId);
  }

  @Get()
  async getChats() {
    return this.aiChat.getChats();
  }
}
