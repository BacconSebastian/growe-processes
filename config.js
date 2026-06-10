'use strict';

/**
 * Carga y valida las variables de entorno requeridas por el scheduler.
 * Si falta alguna variable obligatoria, loguea el error y termina el proceso.
 */

const required = ['API_BASE_URL', 'INTERNAL_JOBS_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[Scheduler] ERROR: La variable de entorno '${key}' es obligatoria y no está definida.`);
    process.exit(1);
  }
}

const API_BASE_URL = process.env.API_BASE_URL.replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 120000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS, 10) || 5000;

module.exports = {
  API_BASE_URL,
  // El secret NUNCA se loguea — se expone solo para ser usado en headers.
  INTERNAL_JOBS_SECRET: process.env.INTERNAL_JOBS_SECRET,
  REQUEST_TIMEOUT_MS: isNaN(REQUEST_TIMEOUT_MS) ? 120000 : REQUEST_TIMEOUT_MS,
  MAX_RETRIES: isNaN(MAX_RETRIES) ? 2 : MAX_RETRIES,
  RETRY_DELAY_MS: isNaN(RETRY_DELAY_MS) ? 5000 : RETRY_DELAY_MS,
};
