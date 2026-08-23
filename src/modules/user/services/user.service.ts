import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UserRepository } from '../repositories/user.repository.js';
import { Logger } from 'nestjs-pino';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';
import { UserEditaisLinkingService } from './user-editais-linking.service.js';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private userEditaisLinkingService: UserEditaisLinkingService,
    private readonly logger: Logger,
  ) {}

  async updateEditaisUser(data: UpdateEditaisUser) {
    return await this.userEditaisLinkingService.updateEditaisUser(data);
  }

  async createUser(data: CreateUser) {
    return await this.userEditaisLinkingService.createUser(data);
  }

  async findManyUsers() {
    return await this.userRepository.findMany();
  }

  async findByChatId(chatId: string) {
    return await this.userRepository.findByChatId(chatId);
  }

  async findByExtensionToken(extensionToken: string) {
    return await this.userRepository.findByExtensionToken(extensionToken);
  }

  async getOrCreateExtensionToken(chatId: string) {
    const user = await this.userRepository.findByChatId(chatId);
    if (!user) return null;
    if (user.extensionToken) return user.extensionToken;

    const token = randomUUID();
    await this.userRepository.setExtensionToken(chatId, token);
    return token;
  }
}
