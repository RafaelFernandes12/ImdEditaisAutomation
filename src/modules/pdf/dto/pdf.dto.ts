import { PdfTipo } from '../../../../generated/prisma/client.js';

export class CreatePdf {
  label: string;
  text: string;
  link: string;
  editalId: number;
  type: PdfTipo;
}
