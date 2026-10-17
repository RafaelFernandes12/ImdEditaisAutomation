import { Injectable } from '@nestjs/common';
import { PdfRepository } from '../repositories/pdf.repository.js';
import { PdfTipo } from '#generated/prisma/enums.js';

@Injectable()
export class PdfService {
  constructor(private pdfRepository: PdfRepository) {}

  async findByLink(link: string) {
    return await this.pdfRepository.findByLink(link);
  }

  async findAllByUserName(userName: string) {
    return await this.pdfRepository.findAllByUserName(userName);
  }

  async findAllActiveByUserName(userName: string) {
    return await this.pdfRepository.findAllActiveByUserName(userName);
  }

  async findByLabel(type: PdfTipo) {
    return await this.pdfRepository.findByLabel(type);
  }
}
