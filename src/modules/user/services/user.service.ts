import { Injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository.js';
import { Logger } from 'nestjs-pino';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private readonly logger: Logger,
  ) {}

  async updateEditaisUser(data: UpdateEditaisUser) {
    return await this.userRepository.updateEditaisUser(data);
  }
  async createUser(data: CreateUser) {
    return await this.userRepository.createUser(data);
  }

  async findManyUsers() {
    return await this.userRepository.getUsers();
  }

  async findByChatId(chatId: string) {
    return await this.userRepository.findByChatId(chatId);
  }
}
