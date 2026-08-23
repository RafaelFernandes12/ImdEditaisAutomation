import { PdfTipo } from '../../../../generated/prisma/client.js';

export function resolvePdfTipo(label: string): PdfTipo {
  const normalized = label.toLowerCase();
  if (normalized.includes('homolog')) return PdfTipo.HOMOLOGACAO;
  if (normalized.includes('resultado')) return PdfTipo.RESULTADO;
  return PdfTipo.EDITAL;
}
