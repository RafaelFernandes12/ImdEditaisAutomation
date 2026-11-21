import type { JobsOptions } from 'bullmq';

const DAY_S = 24 * 60 * 60;

/**
 * Quanto do histórico de jobs fica no Redis. Sem isso o BullMQ guarda todo
 * job concluído ou com falha para sempre, com o payload inteiro (a vaga com a
 * descrição), e o Redis cresce até disputar memória com o Chrome do WhatsApp.
 * Sobra o bastante para inspecionar no /queues.
 */
export const JOB_RETENTION = {
  removeOnComplete: { age: 7 * DAY_S, count: 200 },
  removeOnFail: { age: 30 * DAY_S, count: 500 },
} satisfies JobsOptions;
