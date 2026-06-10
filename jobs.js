'use strict';

/**
 * Tabla declarativa de jobs del scheduler.
 *
 * Cada entrada incluye:
 *   name       — nombre del job (coincide con :jobName en el backend)
 *   when       — descriptor para el dispatcher run-once (run-due-jobs.js)
 *   schedule   — expresión cron para el modo daemon (index.js + node-cron)
 *   timezone   — timezone del cron daemon (undefined = hora del proceso)
 *
 * Tipos de `when`:
 *   { type: 'every-tick' }              — corre en TODOS los ticks (cada :00 y :30)
 *   { type: 'utc-minute', minute: N }   — corre en ticks cuyo minuto UTC === N
 *   { type: 'ar-time', hour: H, minute: M } — corre en ticks cuya hora en
 *                                         America/Argentina/Buenos_Aires === HH:MM
 *
 * Coherencia daemon ↔ dispatcher:
 *   - training-reminder:           cada hora en punto → utc-minute:0 (equivalente)
 *   - workout-unfinished-reminder: cada :00 y :30    → every-tick
 *   - premium-expiration:          00:05 AR daemon → 00:00 AR dispatcher (los 5 min
 *     servían para escalonar dentro del proceso; el dispatcher los secuencia en serie)
 *   - planning-scheduled-promotion: 00:15 AR daemon → 00:00 AR dispatcher (ídem)
 *   - exercise-media-cleanup:      03:00 AR → ar-time 3:0
 *   - draft-cleanup:               03:30 AR → ar-time 3:30
 */

const JOBS = [
  {
    name: 'workout-unfinished-reminder',
    when: { type: 'every-tick' },
    schedule: '*/30 * * * *',
    // sin timezone — hora del proceso
  },
  {
    name: 'training-reminder',
    when: { type: 'utc-minute', minute: 0 },
    schedule: '0 * * * *',
    // sin timezone — hora del proceso
  },
  {
    name: 'premium-expiration',
    when: { type: 'ar-time', hour: 0, minute: 0 },
    schedule: '5 0 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'planning-scheduled-promotion',
    when: { type: 'ar-time', hour: 0, minute: 0 },
    schedule: '15 0 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'exercise-media-cleanup',
    when: { type: 'ar-time', hour: 3, minute: 0 },
    schedule: '0 3 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'draft-cleanup',
    when: { type: 'ar-time', hour: 3, minute: 30 },
    schedule: '30 3 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
];

module.exports = JOBS;
