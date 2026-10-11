import type {
  Formato,
  JobType,
  Modelo,
  PdfTipo,
  Senioridade,
} from '#generated/prisma/enums.js';

export class JobAttributes {
  formato: Formato;
  city: string;
  state: string;
  modelo: Modelo[];
  senioridade: Senioridade[];
}

export class CreateJob {
  title: string;
  link: string;
  type: JobType;
  isActive: boolean;
  summary: string;
  keyWords: string;
  description: string;
  attributes: JobAttributes;
  subscriptionUntil?: Date | null;
  pdfs?: {
    label: string;
    text: string;
    link: string;
    type: PdfTipo;
  }[];
}
