import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserRepository } from '../repositories/user.repository.js';
import { CreateUser, UpdateJobsUser } from '../dto/user.dto.js';
import { UserJobsLinkingService } from './user-jobs-linking.service.js';
import { maskContact } from '../../../utils/log-redact.js';
import { ScopedLogger } from '../../../utils/scoped-logger.js';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private userJobsLinkingService: UserJobsLinkingService,
    @InjectPinoLogger(UserService.name)
    private readonly logger: PinoLogger,
  ) {}

  private get log() {
    return new ScopedLogger(this.logger, 'user');
  }

  async updateJobsUser(data: UpdateJobsUser) {
    const log = this.log.child({ jobsCount: data.jobsId.length }).timed();

    try {
      const user = await this.userJobsLinkingService.updateJobsUser(data);

      log.info('jobs.update.done', 'Editais do usuário atualizados', {
        userId: user.id,
      });

      return user;
    } catch (error: unknown) {
      log.error('jobs.update.failed', 'Falha ao atualizar editais do usuário', {
        contact: maskContact(data.contact),
        err: error,
      });
      throw error;
    }
  }

  async createUser(data: CreateUser) {
    const log = this.log.child({ jobsCount: data.jobsId.length }).timed();

    try {
      const user = await this.userJobsLinkingService.createUser(data);

      log.info('create.done', 'Usuário criado', {
        userId: user.id,
      });

      return user;
    } catch (error: unknown) {
      log.error('create.failed', 'Falha ao criar usuário', {
        contact: maskContact(data.contact),
        err: error,
      });
      throw error;
    }
  }

  async findManyUsers() {
    const log = this.log.timed();
    const users = await this.userRepository.findMany();

    log.debug('find_many.done', 'Usuários carregados', {
      count: users.length,
    });

    return users;
  }
  async reactiveUser(contact: string) {
    const log = this.log.timed();
    const user = await this.userRepository.reactiveUser(contact);

    log.debug('reactive_user.done', 'Usuário reativado', {
      contact: maskContact(user?.contact),
      found: user !== null,
      userId: user?.id,
    });
    return user;
  }
  async deactiveUser(contact: string) {
    const log = this.log.timed();
    const user = await this.userRepository.deactiveUser(contact);

    log.debug('deactive_user.done', 'Usuário desativado', {
      contact: maskContact(user?.contact),
      found: user !== null,
      userId: user?.id,
    });
    return user;
  }
  async findByChatId(chatId: string) {
    const log = this.log.timed();
    const user = await this.userRepository.findByChatId(chatId);

    log.debug('find_by_chat_id.done', 'Busca de usuário por chatId', {
      chatId: maskContact(chatId),
      found: user !== null,
      userId: user?.id,
    });

    return user;
  }
}
