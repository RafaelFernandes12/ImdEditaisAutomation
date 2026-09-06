import { Injectable } from '@nestjs/common';
import { SendsRepository } from '../repositories/sends.repository.js';
import { CreateSend } from '../dto/sends.dto.js';

@Injectable()
export class SendsService {
  constructor(private sendsRepository: SendsRepository) {}

  async createMany(data: CreateSend[]) {
    return await this.sendsRepository.createMany(data);
  }

  async findByUserId(userId: number) {
    return await this.sendsRepository.findByUserId(userId);
  }
}
