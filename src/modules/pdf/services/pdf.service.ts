import { Injectable } from '@nestjs/common';
import { PdfRepository } from '../repositories/pdf.repository.js';
import { CreatePdf } from '../dto/pdf.dto.js';
import { PdfTipo } from '#generated/prisma/enums.js';

@Injectable()
export class PdfService {
  constructor(private pdfRepository: PdfRepository) {}

  async createMany(data: CreatePdf[]) {
    return await this.pdfRepository.createMany(data);
  }

  async findByLink(link: string) {
    return await this.pdfRepository.findByLink(link);
  }
  async findAllResultadosByUserName(userName: string) {
    return await this.pdfRepository.findAllResultadosByUserName(userName);
  }
  async findAllActiveByUserName(userName: string) {
    return await this.pdfRepository.findAllActiveByUserName(userName);
  }

  async findByLabel(type: PdfTipo) {
    return await this.pdfRepository.findByLabel(type);
  }
}
