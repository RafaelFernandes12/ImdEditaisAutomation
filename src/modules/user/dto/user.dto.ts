import { Formato, Modelo, Senioridade } from '#generated/prisma/enums.js';

export class UserPreferencesData {
  keyWords: string;
  modelo: Modelo[];
  formato: Formato;
  senioridade: Senioridade[];
  city: string;
  state: string;
}

export class CreateUser {
  chatId: string;
  contact: string;
  name: string;
  jobsId: number[];
  preferences: UserPreferencesData;
}

export class UpdateJobsUser {
  contact: string;
  jobsId: number[];
}
