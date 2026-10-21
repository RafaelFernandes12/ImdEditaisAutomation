export type GupyWorkplaceType = 'remote' | 'hybrid' | 'on-site';

export type GupyJobType =
  | 'vacancy_type_effective'
  | 'vacancy_type_internship'
  | 'vacancy_type_apprentice'
  | 'vacancy_type_trainee'
  | 'vacancy_type_temporary'
  | 'vacancy_type_talent_pool'
  | 'vacancy_type_associate'
  | 'vacancy_type_outsource'
  | 'vacancy_type_freelancer'
  | 'vacancy_type_autonomous'
  | 'vacancy_type_intermittent'
  | 'vacancy_type_volunteer'
  | 'vacancy_type_summer'
  | 'vacancy_type_lecturer'
  | 'vacancy_type_parter'
  | 'vacancy_legal_entity';

export interface GupyBadges {
  friendlyBadge: boolean;
  isPWD: boolean;
}

export interface GupyJob {
  id: number;
  name: string;
  applicationDeadline: string | null;
  description: string;
  careerPageName: string;
  careerPageLogo: string;
  careerPageUrl: string;
  type: GupyJobType;
  publishedDate: string;
  workplaceType: GupyWorkplaceType;
  // Vazios ('') quando a vaga é remota.
  city: string;
  state: string;
  jobUrl: string;
  // Só vem em parte das vagas.
  badges?: GupyBadges;
  disabilities: boolean;
  quickApply?: boolean;
}

// Recorte do `job` que a página da vaga embute no __NEXT_DATA__. As seções vêm
// em HTML e a da listagem (description) não traz tudo.
export interface GupyJobPage {
  id: number;
  name: string;
  status: string;
  description: string | null;
  responsibilities: string | null;
  prerequisites: string | null;
  relevantExperiences: string | null;
  addressCity: string | null;
  // Sigla da UF; vazia quando a vaga é remota. Em vaga de fora vem a sigla da
  // região do outro país ou lixo ("Ninguno").
  addressStateShortName: string | null;
  // ISO do país ("BR", "CO", "MX"); vazio em parte das vagas remotas.
  addressCountryShortName: string | null;
}

export interface GupyPagination {
  // Não é confiável: fica em 100 para limit > 10.
  total: number;
  limit: number;
  offset: number;
}

export interface GupyJobsResponse {
  data: GupyJob[];
  pagination: GupyPagination;
}
