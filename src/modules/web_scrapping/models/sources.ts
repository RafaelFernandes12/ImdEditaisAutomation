import { JobType } from '#generated/prisma/enums.js';

export interface JobUrl {
  link: string;
  title: string;
  type: JobType;
  subscriptionUntil: Date;
}

export interface JobPdfLink {
  label: string;
  link: string;
}

export interface JobWithPdfLinks extends JobUrl {
  href: JobPdfLink[];
}

interface StiArquivo {
  title?: { rendered?: string | null };
  acf?: { anexo?: string | null };
}

export interface StiEdital {
  id: number;
  title: { rendered: string };
  acf: {
    fim_das_inscricoes: string;
    arquivos?: StiArquivo[] | false | null;
  };
}
