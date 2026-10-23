// "IN_PERSON", "HYBRID" ou "REMOTE". Quase sempre vazio.
export type SeniorJobModel = 'IN_PERSON' | 'HYBRID' | 'REMOTE';

export interface SeniorLocalization {
  // Às vezes em maiúsculas ("NATAL").
  city: string;
  // Sigla da UF.
  province: string;
  country: string;
}

export interface SeniorCompany {
  id: string;
  name: string;
}

// Vaga da listagem: sem a descrição.
export interface SeniorVacancy {
  id: string;
  title: string;
  jobModel: SeniorJobModel[];
  localization: SeniorLocalization | null;
  // Dias (AAAA-MM-DD). A listagem só traz vaga com endDate de hoje em diante.
  publication: { startDate: string; endDate: string | null } | null;
}

export interface SeniorSearchResponse {
  totalPages: number;
  totalElements: number;
  contents: { vacancy: SeniorVacancy; company: SeniorCompany }[];
}

// Bloco de texto da vaga, em HTML. Requisitos e atividades costumam vir sem
// description: tudo fica no about.
interface SeniorSection {
  description?: string | null;
}

export interface SeniorVacancyDetails extends SeniorVacancy {
  pcd: boolean;
  positions: number;
  about: SeniorSection | null;
  requirements: SeniorSection | null;
  duties: SeniorSection | null;
}

export interface SeniorVacancyResponse {
  vacancy: SeniorVacancyDetails;
  company: SeniorCompany;
}
