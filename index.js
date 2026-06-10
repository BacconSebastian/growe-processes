'use strict';

// config.js se carga primero — valida las variables requeridas y hace process.exit(1) si faltan.
const config = require('./config');
const cron = require('node-cron');
const JOBS = require('./jobs');
const { triggerJob } = require('./trigger');

/**
 * Registra todos los jobs definidos en jobs.js con node-cron.
 * Cada disparo llama a triggerJob(name), que nunca lanza — los fallos
 * son logueados internamente y no tumban el proceso.
 */
const registerJobs = () => {
  for (const job of JOBS) {
    const options = job.timezone ? { timezone: job.timezone } : undefined;

    cron.schedule(
      job.schedule,
      () => {
        triggerJob(job.name);
      },
      options
    );
  }
};

/**
 * Manejadores de señales para un shutdown limpio.
 */
const shutdown = (signal) => {
  console.log(`[Scheduler] Señal ${signal} recibida. Terminando proceso...`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Arranque ────────────────────────────────────────────────────────────────

registerJobs();

console.log('[Scheduler] Iniciado. Jobs registrados:');
for (const job of JOBS) {
  const tz = job.timezone ? ` [${job.timezone}]` : ' [hora del servidor]';
  console.log(`  - ${job.name}  |  ${job.schedule}${tz}`);
}
console.log(`[Scheduler] Backend: ${config.API_BASE_URL}`);
