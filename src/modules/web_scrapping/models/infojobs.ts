// Card da listagem de vagas, lido do HTML.
export interface InfojobsCard {
  id: string;
  title: string;
  // Caminho com o slug do título: "/vaga-de-desenvolvedor-em-natal__123.aspx".
  path: string;
  // "Natal - RN" ou, em vaga sem local fixo, "Todo Brasil".
  location: string;
  // Dia da última publicação (AAAA-MM-DD). A vaga renovada volta com a data
  // nova; a página dela continua com a da primeira publicação.
  postedAt: string | null;
  // "Presencial", "Híbrido" ou "Home office".
  workplace: string | null;
  // "R$ 1.100,00 a R$ 1.540,00", "R$ 800,00" ou "A combinar".
  salary: string | null;
}

// O que a página da vaga tem além do card.
export interface InfojobsJobPage {
  descriptionHtml: string;
  // "Estágio", "Efetivo – CLT", "Prestador de Serviços (PJ)"...
  contract: string | null;
  // Nível da vaga ("Estagiário", "Analista"...), do começo da área
  // profissional: "Estagiário em Informática, TI, Telecomunicações - TI".
  level: string | null;
  // Salário mensal mínimo do JSON-LD. A página de vaga sem local fixo não tem
  // o JSON-LD.
  salary: number | null;
}
