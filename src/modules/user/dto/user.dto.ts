export class CreateUser {
  chatId: string;
  contact: string;
  name: string;
  matricula: string;
  editaisId: number[];
  curriculoVitae?: string;
  curriculoLattes?: string;
}

export class UpdateEditaisUser {
  contact: string;
  editaisId: number[];
}
