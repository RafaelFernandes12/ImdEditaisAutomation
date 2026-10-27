// "presencial", "hibrido" ou "remoto".
export type SolidesJobType = 'presencial' | 'hibrido' | 'remoto';

export interface SolidesOption {
  id: number;
  // Senioridade: "Estagiário", "Junior", "Pleno", "Sênior", "Especialista",
  // "Principal". Contrato: "CLT", "PJ", "Estágio", "Autônomo", "Cooperado"...
  name: string;
}

export interface SolidesSalary {
  type: 'simple' | 'range';
  // Falso quando a empresa esconde o salário do candidato.
  showRangeToApplicant: boolean;
  // Vêm nulos ou zerados quando a vaga não informa.
  initialRange: number | null;
  finalRange: number | null;
  negotiable: boolean;
}

// Vaga da listagem do portal, que já traz a descrição completa.
export interface SolidesJob {
  // Numérico nas vagas da Sólides; texto nas que vêm do RH Gestor.
  id: number | string;
  title: string;
  // HTML.
  description: string | null;
  companyName: string;
  city: { name: string } | null;
  // Sigla da UF em code; vazia em parte das vagas.
  state: { name: string; code: string } | null;
  jobType: SolidesJobType;
  salary: SolidesSalary | null;
  seniority: SolidesOption[] | null;
  recruitmentContractType: SolidesOption[] | null;
  hardSkills: SolidesOption[] | null;
  // Dia da publicação (AAAA-MM-DD).
  createdAt: string;
  // Fim das inscrições (AAAA-MM-DD). A listagem continua mostrando a vaga
  // depois dele.
  date: { due: string | null; show: boolean } | null;
  // Vaga do RH Gestor: a página dela fica lá, não no portal.
  publishers: { rhgestor?: { redirectUrl?: string } } | null;
}

export interface SolidesJobsResponse {
  count: number;
  currentPage: number;
  totalPages: number;
  data: SolidesJob[];
}
