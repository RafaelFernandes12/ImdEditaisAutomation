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
  | 'isInternational'
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
  | 'isInternational'
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
      priority: 1,
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
      priority: 1,
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
      priority: 1.4,
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
      priority: 1.4,
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
      priority: 1.4,
    },
  ],
  [
    'LAIS',
    {
      ecossytem: 65,
      escolaridade: 20,
      salary: 5,
      formato: 5,
      city: 0,
      modelo: 5,
      senioridade: 0,
      priority: 1.4,
    },
  ],
  [
    'ECT',
    {
      ecossytem: 65,
      escolaridade: 20,
      salary: 5,
      formato: 5,
      city: 0,
      modelo: 5,
      senioridade: 0,
      priority: 1.4,
    },
  ],
  [
    'FUNPEC',
    {
      ecossytem: 55,
      escolaridade: 10,
      salary: 5,
      formato: 10,
      city: 0,
      modelo: 10,
      senioridade: 10,
      priority: 1.4,
    },
  ],
]);

type ActiveJob = jobs[number];

export type RankedVaga = {
  job: ActiveJob;
  vaga: ActiveJob['vagas'][number];
  score: number;
};

const MIN_SCORE = 50;
// Editais e vagas das fontes locais vão sempre; o score só ordena.
const ALWAYS_SENT: JobType[] = ['IMD', 'STI', 'JERIMUM'];

/** Vagas que o usuário deve receber, da mais para a menos compatível. */
export function rankVagas(
  user: { UserPreferences: Preferences | null },
  jobs: jobs,
): RankedVaga[] {
  const preferences = user.UserPreferences;

  return jobs
    .flatMap((job) =>
      job.vagas.map((vaga) => ({
        job,
        vaga,
        // Cadastro antigo, sem preferências: recebe tudo, sem ordem.
        score: preferences ? vagaMatches(preferences, vaga, job.type).score : 0,
      })),
    )
    .filter(
      ({ job, score }) =>
        !preferences || ALWAYS_SENT.includes(job.type) || score >= MIN_SCORE,
    )
    .sort((a, b) => b.score - a.score);
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
  soma *= weightJob.priority;

  // Penalidade fixa, aplicada depois do peso da fonte: vale -100 em qualquer
  // tipo de vaga.
  if (vaga.isInternational && !preferences.isInternational) soma -= 100;

  const vagaScored = {
    ...vaga,
    type: jobType,
    score: soma,
  };

  return vagaScored;
}

function matchesEcosystem(preferences: Preferences, vaga: FilterableVaga) {
  const userEcosystems = new Set(splitList(preferences.keyWords));
  const vagaEcosystems = new Set(splitList(vaga.ecossytem));
  if (userEcosystems.size === 0 || vagaEcosystems.size === 0) return 0;
  const isMatch = [...vagaEcosystems].some((eco) => userEcosystems.has(eco));
  return isMatch ? 1 : 0;
}

// ''.split(',') devolve [''], que casaria com um cadastro vazio.
function splitList(list: string) {
  return list
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesSenioridade(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.senioridade || preferences.senioridade.length === 0) return 0.5;
  return preferences.senioridade.includes(vaga.senioridade) ? 1 : -100;
}

function matchesEscolaridade(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.escolaridade || preferences.escolaridade.length === 0) return 0.5;
  return preferences.escolaridade.includes(vaga.escolaridade) ? 1 : 0;
}

function matchesModelo(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.modelo || preferences.modelo.length === 0) return 0.5;
  return preferences.modelo.includes(vaga.modelo) ? 1 : 0;
}

function matchesFormato(preferences: Preferences, vaga: FilterableVaga) {
  if (!vaga.formato || preferences.formato.length === 0) return 0.5;
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
  const acceptsRemote = formatoUser.includes('REMOTO');
  const acceptsLocal =
    formatoUser.includes('PRESENCIAL') || formatoUser.includes('HIBRIDO');
  const hasLocation = Boolean(vaga.city || vaga.state);

  function isSameLocation(preferences: Preferences, vaga: FilterableVaga) {
    return vaga.city
      ? normalizeText(vaga.city) === normalizeText(preferences.city)
      : normalizeText(vaga.state) === normalizeText(preferences.state);
  }

  if (!vaga.formato) {
    if (!hasLocation) return acceptsRemote ? 1 : 0;
    if (!isSameLocation(preferences, vaga)) return -100;
    return acceptsLocal ? 1 : 0;
  }

  if (vaga.formato === 'REMOTO') return acceptsRemote ? 1 : -100;
  if (!acceptsLocal) return -100;

  if (!hasLocation) return 0;
  return isSameLocation(preferences, vaga) ? 1 : -100;
}

function normalizeText(text: string | null | undefined) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
