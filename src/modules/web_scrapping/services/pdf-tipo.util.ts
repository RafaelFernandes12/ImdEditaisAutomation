import { PdfTipo } from '../../../../generated/prisma/client.js';

export function resolvePdfTipo(label: string): PdfTipo {
  const normalized = label.toLowerCase();
  if (normalized.includes('curric')) return PdfTipo.CURRICULO;
  if (normalized.includes('homolog')) return PdfTipo.HOMOLOGACAO;
  if (normalized.includes('entrevis')) return PdfTipo.ENTREVISTA;
  if (normalized.includes('resultado')) return PdfTipo.RESULTADO;
  return PdfTipo.EDITAL;
}
