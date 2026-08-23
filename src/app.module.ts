import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AiChatModule } from './modules/ai_chat/ai_chat.module.js';
import { WebScrappingModule } from './modules/web_scrapping/web_scrapping.module.js';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module.js';
import { UserModule } from './modules/user/user.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { PuppeteerModule } from './modules/puppeteer/puppeteer.module.js';

@Module({
  imports: [
    AiChatModule,
    WebScrappingModule,
    WhatsappModule,
    UserModule,
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
        enabled: false,
        transport: {
          targets: [
            {
              target: 'pino-loki',
              options: {
                host: process.env.LOKI_URL,
                labels: { app: 'projeto_ai' },
                batching: true,
                interval: 5,
              },
            },
            { target: 'pino-pretty', options: { colorize: true } },
          ],
        },
      },
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
      },
    }),
    FilesModule,
    PuppeteerModule,
  ],
})
export class AppModule {}
