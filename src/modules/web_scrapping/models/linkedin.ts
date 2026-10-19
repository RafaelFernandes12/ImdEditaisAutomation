// Card da busca pública de vagas (sem login), lido do HTML.
export interface LinkedinCard {
  id: string;
  title: string;
  // Com Accept-Language pt-BR: "Natal, RN", "Rio de Janeiro, Brasil",
  // "São Paulo e Região" ou só "Brasil".
  location: string;
  // Dia da publicação (AAAA-MM-DD).
  postedAt: string | null;
}

// O que a página pública da vaga tem além do card. Os critérios vêm com o
// rótulo em português ("Nível de experiência", "Tipo de emprego").
export interface LinkedinJobPage {
  descriptionHtml: string | null;
  criteria: Record<string, string>;
}
