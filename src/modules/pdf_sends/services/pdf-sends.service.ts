import { Injectable } from '@nestjs/common';
import { PdfSendsRepository } from '../repositories/pdf-sends.repository.js';
import { CreatePdfSend } from '../dto/pdf-sends.dto.js';

@Injectable()
export class PdfSendsService {
  constructor(private pdfSendsRepository: PdfSendsRepository) {}

  async createMany(data: CreatePdfSend[]) {
    return await this.pdfSendsRepository.createMany(data);
  }
}
