import { Injectable } from '@nestjs/common';
import { EditalToUserRepository } from '../repositories/edital-to-user.repository.js';
import {
  CreateEditalToUser,
  UpdateEditalToUserStatus,
} from '../dto/edital-to-user.dto.js';

@Injectable()
export class EditalToUserService {
  constructor(private editalToUserRepository: EditalToUserRepository) {}

  async upsert(id: number, data: CreateEditalToUser) {
    return await this.editalToUserRepository.upsert(id, data);
  }
  async create(data: CreateEditalToUser) {
    return await this.editalToUserRepository.create(data);
  }

  async updateStatus(data: UpdateEditalToUserStatus) {
    return await this.editalToUserRepository.updateStatus(data);
  }
}
