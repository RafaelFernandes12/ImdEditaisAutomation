const PAGE_BOILERPLATE =
  /^[ \t]*(?:MINISTÉRIO DA EDUCAÇÃO|UNIVERSIDADE FEDERAL DO RIO GRANDE DO NORTE|INSTITUTO METRÓPOLE DIGITAL|Instituto Metrópole Digital \|.*|.*\(84\) 3342-2216.*|.*www\.imd\.ufrn\.br.*|-- \d+ of \d+ --)[ \t]*$/gm;

// Só o cabeçalho da seção é caixa alta; "Anexo I" no meio do texto é referência
// cruzada e não deve servir de corte.
const ANEXO_HEADING = /^ANEXO\s+[A-Z0-9]+\b.*$/m;

// Nem todo Anexo I é a tabela de vagas (às vezes é cronograma), e alguns editais
// não têm anexo nenhum. Sem esses sinais, o corte é descartado.
const VAGA_SIGNALS =
  /R\$|Tipo de bolsa|Carga hor[áa]ria|Remunera[çc][ãa]o|Pr[ée].?requisitos|N[úu]mero de vagas/i;

function stripPageBoilerplate(text: string): string {
  return text.replace(PAGE_BOILERPLATE, '').replace(/\n{3,}/g, '\n\n');
}

export function trimEditalForSummary(text: string): string {
  const stripped = stripPageBoilerplate(text);

  const anexo = stripped.match(ANEXO_HEADING);
  if (anexo?.index === undefined) return stripped;

  const fromAnexo = stripped.slice(anexo.index);
  return VAGA_SIGNALS.test(fromAnexo) ? fromAnexo : stripped;
}
