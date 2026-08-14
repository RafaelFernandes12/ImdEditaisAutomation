import { PdfTipo } from '../../../../generated/prisma/client.js';

export class CreateEdital {
  badge: string;
  title: string;
  link: string;
  isActive: boolean;
  subscriptionUntil: string;
}

export class CreatePdf {
  label: string;
  text: string;
  link: string;
  editalId: number;
  type: PdfTipo;
}
