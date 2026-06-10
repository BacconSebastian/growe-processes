'use strict';

/**
 * Tabla declarativa de jobs registrados en el scheduler.
 * Cada entrada define el nombre del job (debe coincidir con el :jobName del endpoint
 * del backend), el schedule en formato cron, y opcionalmente la timezone.
 *
 * Los 2 primeros jobs NO llevan timezone — corren en la hora del proceso del servidor
 * (replica el comportamiento actual del backend in-process).
 * Los 4 jobs diarios usan America/Argentina/Buenos_Aires para mantener el
 * horario argentino independientemente del TZ del servidor de deploy.
 */

const JOBS = [
  {
    name: 'training-reminder',
    schedule: '0 * * * *',
    // sin timezone — hora del proceso
  },
  {
    name: 'workout-unfinished-reminder',
    schedule: '*/30 * * * *',
    // sin timezone — hora del proceso
  },
  {
    name: 'premium-expiration',
    schedule: '5 0 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'planning-scheduled-promotion',
    schedule: '15 0 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'exercise-media-cleanup',
    schedule: '0 3 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  {
    name: 'draft-cleanup',
    schedule: '30 3 * * *',
    timezone: 'America/Argentina/Buenos_Aires',
  },
];

module.exports = JOBS;
