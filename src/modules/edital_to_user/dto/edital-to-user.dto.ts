import { StatusEdital } from '../../../../generated/prisma/client.js';

export class CreateEditalToUser {
  userId: number;
  editalId: number;
  status: StatusEdital;
}

export class UpdateEditalToUserStatus {
  id: number;
  status: StatusEdital;
}
