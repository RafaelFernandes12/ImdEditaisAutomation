import { Injectable } from '@nestjs/common';
import { RemindersRepository } from '../repositories/reminders.repository.js';

@Injectable()
export class RemindersService {
  constructor(private readonly remindersRepository: RemindersRepository) {}

  async execute(): Promise<void> {}
}
