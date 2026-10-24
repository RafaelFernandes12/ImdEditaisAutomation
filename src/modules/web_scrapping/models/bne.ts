// Vaga do JSON que a listagem embute no input #jobInfoLocal. Recorte dos
// campos usados.
export interface BneJob {
  Id: number;
  // 0 é vaga ativa; a listagem mostra também as encerradas (2), depois das
  // ativas.
  Status: number;
  Function: { Name: string };
  City: { Name: string } | null;
  StateAbbreviation: string | null;
  // "Informática", "Comércio"...
  Area: string;
  CompanyName: string | null;
  // Zerados quando o salário é "a combinar".
  MinSalary: number;
  MaxSalary: number;
  // ISO.
  PostDate: string;
  // "Efetivo", "Estágio"... Quase sempre vazio: o contrato certo está na
  // página da vaga.
  LinkType: string[];
  Home_Office: boolean;
  Url: string;
}

// O que a página da vaga tem além da listagem.
export interface BneJobPage {
  // HTML do JSON-LD JobPosting; a da listagem vem cortada.
  descriptionHtml: string;
  // "Presencial" ou "Home Office".
  modality: string | null;
  // "Efetivo", "Temporário", "Estágio", "Autônomo", "Freelancer", "Aprendiz".
  contract: string | null;
}
