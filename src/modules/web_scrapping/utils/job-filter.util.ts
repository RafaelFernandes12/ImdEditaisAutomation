import type {
  JobType,
  UserPreferences,
  Vaga,
} from '#generated/prisma/client.js';
import { JobsService } from '#src/modules/jobs/services/jobs.service.js';
import { BadRequestException } from '@nestjs/common';
type jobs = Awaited<ReturnType<JobsService['findActive']>>;

type Preferences = Pick<
  UserPreferences,
  | 'keyWords'
  | 'formato'
  | 'city'
  | 'state'
  | 'modelo'
  | 'senioridade'
  | 'escolaridade'
  | 'salary'
>;

type FilterableVaga = Pick<
  Vaga,
  | 'keyWords'
  | 'ecossytem'
  | 'formato'
  | 'city'
  | 'state'
  | 'modelo'
  | 'senioridade'
  | 'escolaridade'
  | 'salary'
>;

const weights = new Map<
  JobType,
  {
    ecossytem: number;
    escolaridade: number;
    salary: number;
    formato: number;
    city: number;
    modelo: number;
    senioridade: number;
    priority: number;
  }
>([
  [
    'FRONTEND_GITHUB',
    {
      ecossytem: 40,
      escolaridade: 10,
      salary: 5,
      formato: 5,
      city: 1,
      modelo: 4,
      senioridade: 30,
      priority: 0,
    },
  ],
  [
    'BACKEND_GITHUB',
    {
      ecossytem: 40,
      escolaridade: 10,
      salary: 5,
      formato: 5,
      city: 1,
      modelo: 4,
      senioridade: 30,
      priority: 0,
    },
  ],
  [
    'STI',
    {
      ecossytem: 55,
      escolaridade: 10,
      salary: 5,
      formato: 10,
      city: 0,
      modelo: 10,
      senioridade: 10,
      priority: 100,
    },
  ],
  [
    'JERIMUM',
    {
      ecossytem: 50,
      escolaridade: 0,
      salary: 20,
      formato: 5,
      city: 0,
      modelo: 5,
      senioridade: 20,
      priority: 100,
    },
  ],
  [
    'IMD',
    {
      ecossytem: 65,
      escolaridade: 20,
      salary: 5,
      formato: 5,
      city: 0,
      modelo: 5,
      senioridade: 0,
      priority: 100,
    },
  ],
]);

export function jobFilter(
  user: { UserPreferences: Preferences | null },
  jobs: jobs,
): jobs {
  const preferences = user.UserPreferences;
  // Cadastro antigo, sem preferências: recebe tudo.
  if (!preferences) return jobs;

  const a = jobs.flatMap((job) => {
    if (job.vagas.length === 0) return [];

    const vagas = job.vagas.map((vaga) => {
      const res = vagaMatches(preferences, vaga, job.type);
      return res;
    });
    // const sortedVagas = vagas.sort((vaga) => vaga.score);
    // console.log('SORTEDVAGAS', sortedVagas);
    return vagas;
  });
  const sortedVagas = a.sort((a, b) => a.score - b.score);
  console.log('SORTEDVAGAS', sortedVagas);
  return [];
}

export function vagaMatches(
  preferences: Preferences,
  vaga: FilterableVaga,
  jobType: JobType,
) {
  let soma = 0;
  const weightJob = weights.get(jobType);
  if (!weightJob) throw new BadRequestException('n tem');

  const ecossytem = matchesEcosystem(preferences, vaga);
  soma += ecossytem * weightJob.ecossytem;

  const senior = matchesSenioridade(preferences, vaga);
  soma += senior * weightJob.senioridade;

  const escolaridade = matchesEscolaridade(preferences, vaga);
  soma += escolaridade * weightJob.escolaridade;

  const modelo = matchesModelo(preferences, vaga);
  soma += modelo * weightJob.modelo;

  const location = matchesLocation(preferences, vaga);
  soma += location * weightJob.city;

  const salary = matchesSalary(preferences, vaga);
  soma += salary * weightJob.salary;

  const formato = matchesFormato(preferences, vaga);
  soma += formato * weightJob.formato;
  soma += weightJob.priority;

  const vagaScored = {
    ...vaga,
    score: soma,
  };

  console.log('VAGASCORED', vagaScored);

  return vagaScored;
}

function matchesEcosystem(preferences: Preferences, vaga: FilterableVaga) {
  const userEcosystems = new Set(preferences.keyWords.split(','));
  const vagaEcosystems = new Set(vaga.ecossytem.split(','));
  if (userEcosystems.size === 0 || vagaEcosystems.size === 0) return 0;
  const isMatch = [...vagaEcosystems].some((eco) => {
    return userEcosystems.has(eco.trim());
  });
  return isMatch ? 1 : 0;
}

function matchesSenioridade(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.senioridade || preferences.senioridade.length === 0) return 0;
  return preferences.senioridade.includes(vaga.senioridade) ? 1 : 0;
}

function matchesEscolaridade(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.escolaridade || preferences.escolaridade.length === 0) return 0;
  return preferences.escolaridade.includes(vaga.escolaridade) ? 1 : 0;
}

function matchesModelo(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.modelo || preferences.modelo.length === 0) return 0;
  return preferences.modelo.includes(vaga.modelo) ? 1 : 0;
}

function matchesFormato(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.formato || preferences.formato.length === 0) return 0;
  return preferences.formato.includes(vaga.formato) ? 1 : 0;
}

function matchesSalary(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.salary) return 0;
  const pct = 0.1 + 0.05 * Math.log2(preferences.salary / 1000);
  const pctC = Math.min(Math.max(0.1, pct), 0.25);
  const margem = preferences.salary * pctC;
  const piso = preferences.salary - margem;
  if (preferences.salary <= vaga.salary) return 1;
  if (vaga.salary < piso) return 0;
  return (vaga.salary - piso) / margem;
}

function matchesLocation(preferences: Preferences, vaga: FilterableVaga) {
  const formatoUser = preferences.formato;

  if (!vaga.formato && formatoUser.includes('REMOTO')) return 1;
  if (formatoUser.includes('REMOTO') && vaga.formato === 'REMOTO') return 1;
  if (
    (formatoUser.includes('PRESENCIAL') &&
      normalizeText(vaga.city) === normalizeText(preferences.city)) ||
    (formatoUser.includes('HIBRIDO') &&
      normalizeText(vaga.city) === normalizeText(preferences.city))
  )
    return 1;
  return -100;
}

function normalizeText(text: string | null | undefined) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
