import type {
  Escolaridade,
  Formato,
  JobType,
  Modelo,
  PdfTipo,
  Senioridade,
} from '#generated/prisma/enums.js';

// Campo que a IA não achou fica null.
export class VagaAttributes {
  ecossytem: string;
  salary: number | null;
  formato: Formato | null;
  city: string | null;
  state: string | null;
  modelo: Modelo | null;
  senioridade: Senioridade | null;
  escolaridade: Escolaridade | null;
}

export class CreateVaga extends VagaAttributes {
  summary: string;
  keyWords: string;
}

export class CreateJob {
  title: string;
  link: string;
  type: JobType;
  isActive: boolean;
  description: string;
  vagas: CreateVaga[];
  subscriptionUntil?: Date | null;
  pdfs?: {
    label: string;
    text: string;
    link: string;
    type: PdfTipo;
  }[];
}
