import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserRepository } from '../repositories/user.repository.js';
import { CreateUser, UpdateEditaisUser } from '../dto/user.dto.js';
import { UserEditaisLinkingService } from './user-editais-linking.service.js';
import { maskContact } from '../../../utils/log-redact.js';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private userEditaisLinkingService: UserEditaisLinkingService,
    @InjectPinoLogger(UserService.name)
    private readonly logger: PinoLogger,
  ) {}

  async updateEditaisUser(data: UpdateEditaisUser) {
    const startedAt = Date.now();

    try {
      const user = await this.userEditaisLinkingService.updateEditaisUser(data);

      this.logger.info(
        {
          evt: 'user.editais.update.done',
          userId: user.id,
          editaisCount: data.editaisId.length,
          durationMs: Date.now() - startedAt,
        },
        'Editais do usuário atualizados',
      );

      return user;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'user.editais.update.failed',
          contact: maskContact(data.contact),
          editaisCount: data.editaisId.length,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao atualizar editais do usuário',
      );
      throw error;
    }
  }

  async createUser(data: CreateUser) {
    const startedAt = Date.now();

    try {
      const user = await this.userEditaisLinkingService.createUser(data);

      this.logger.info(
        {
          evt: 'user.create.done',
          userId: user.id,
          editaisCount: data.editaisId.length,
          durationMs: Date.now() - startedAt,
        },
        'Usuário criado',
      );

      return user;
    } catch (error: unknown) {
      this.logger.error(
        {
          evt: 'user.create.failed',
          contact: maskContact(data.contact),
          editaisCount: data.editaisId.length,
          durationMs: Date.now() - startedAt,
          err: error,
        },
        'Falha ao criar usuário',
      );
      throw error;
    }
  }

  async findManyUsers() {
    const startedAt = Date.now();
    const users = await this.userRepository.findMany();

    this.logger.debug(
      {
        evt: 'user.find_many.done',
        count: users.length,
        durationMs: Date.now() - startedAt,
      },
      'Usuários carregados',
    );

    return users;
  }
  async reactiveUser(contact: string) {
    const startedAt = Date.now();
    const user = await this.userRepository.reactiveUser(contact);

    this.logger.debug(
      {
        evt: 'user.reactive_user.done',
        contact: maskContact(user?.contact),
        found: user !== null,
        userId: user?.id,
        durationMs: Date.now() - startedAt,
      },
      'Usuário reativado',
    );
    return user;
  }
  async deactiveUser(contact: string) {
    const startedAt = Date.now();
    const user = await this.userRepository.deactiveUser(contact);

    this.logger.debug(
      {
        evt: 'user.deactive_user.done',
        contact: maskContact(user?.contact),
        found: user !== null,
        userId: user?.id,
        durationMs: Date.now() - startedAt,
      },
      'Usuário desativado',
    );
    return user;
  }
  async findByChatId(chatId: string) {
    const startedAt = Date.now();
    const user = await this.userRepository.findByChatId(chatId);

    this.logger.debug(
      {
        evt: 'user.find_by_chat_id.done',
        chatId: maskContact(chatId),
        found: user !== null,
        userId: user?.id,
        durationMs: Date.now() - startedAt,
      },
      'Busca de usuário por chatId',
    );

    return user;
  }
}
