import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module.js';
import { FormsController } from './controllers/forms.controller.js';
import { FormsService } from './services/forms.service.js';
import { FormAnswerService } from './services/form-answer.service.js';

@Module({
  imports: [UserModule],
  controllers: [FormsController],
  providers: [FormsService, FormAnswerService],
})
export class FormsModule {}
