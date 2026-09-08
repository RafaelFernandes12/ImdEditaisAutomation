import { Injectable } from '@nestjs/common';
import { EditalRepository } from '../repositories/edital.repository.js';
import { CreateEdital } from '../dto/edital.dto.js';

@Injectable()
export class EditalService {
  constructor(private editalRepository: EditalRepository) {}

  async createEdital(data: CreateEdital) {
    return await this.editalRepository.createEdital(data);
  }

  async findActive() {
    return await this.editalRepository.findActive();
  }

  async deactivateMany(data: { id: number; validUntil: number }[]) {
    return await this.editalRepository.deactivateMany(data);
  }
}
