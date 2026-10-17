import { PinoLogger } from 'nestjs-pino';

export type LogFields = Record<string, unknown>;

type Level = 'debug' | 'info' | 'warn' | 'error';

/**
 * Prende um prefixo de `evt` e campos fixos (queue, queueJobId, cron...) ao
 * PinoLogger, para que cada chamada só informe o que muda:
 * `log.info('job_done', 'Vaga gravada', { jobId })` vira
 * `{ evt: '<scope>.job_done', ...bindings, jobId }`.
 */
export class ScopedLogger {
  constructor(
    private readonly logger: PinoLogger,
    readonly scope: string,
    private readonly bindings: LogFields = {},
    private readonly startedAt?: number,
  ) {}

  /** Novo logger com mais campos fixos e, opcionalmente, um sub-escopo. */
  child(bindings: LogFields, scope?: string) {
    return new ScopedLogger(
      this.logger,
      scope ? `${this.scope}.${scope}` : this.scope,
      { ...this.bindings, ...bindings },
      this.startedAt,
    );
  }

  /** Mesmo logger, mas todo log a partir daqui leva `durationMs`. */
  timed() {
    return new ScopedLogger(this.logger, this.scope, this.bindings, Date.now());
  }

  /**
   * Loga o início de uma etapa e devolve um logger cronometrado para os
   * logs de done/failed:
   *
   *   const timer = log.start('job_start', 'Processando novo edital');
   *   timer.info('job_done', 'Edital gravado', { jobId });
   *   timer.error('job_failed', 'Falha ao processar', { err });
   */
  start(evt: string, msg: string, fields?: LogFields, level: Level = 'info') {
    this.write(level, evt, msg, fields);
    return this.timed();
  }

  debug(evt: string, msg: string, fields?: LogFields) {
    this.write('debug', evt, msg, fields);
  }

  info(evt: string, msg: string, fields?: LogFields) {
    this.write('info', evt, msg, fields);
  }

  warn(evt: string, msg: string, fields?: LogFields) {
    this.write('warn', evt, msg, fields);
  }

  error(evt: string, msg: string, fields?: LogFields) {
    this.write('error', evt, msg, fields);
  }

  private write(level: Level, evt: string, msg: string, fields?: LogFields) {
    const duration =
      this.startedAt === undefined
        ? {}
        : { durationMs: Date.now() - this.startedAt };

    this.logger[level](
      { evt: `${this.scope}.${evt}`, ...this.bindings, ...fields, ...duration },
      msg,
    );
  }
}
