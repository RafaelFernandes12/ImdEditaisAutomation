import { Module } from '@nestjs/common';
import { UserSubscriptionRepository } from './repositories/user-subscription.repository.js';

@Module({
  providers: [UserSubscriptionRepository],
})
export class UserSubscriptionModule {}
