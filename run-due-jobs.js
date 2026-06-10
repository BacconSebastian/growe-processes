'use strict';

// config.js se carga primero — valida las variables requeridas y hace process.exit(1) si faltan.
const config = require('./config');
const JOBS = require('./jobs');
const { triggerJob } = require('./trigger');

// ── Helpers de tiempo ────────────────────────────────────────────────────────

/**
 * Redondea un timestamp HACIA ABAJO al límite de 30 minutos más cercano (UTC).
 * Ejemplos:
 *   03:07:42 UTC → 03:00:00 UTC
 *   14:31:00 UTC → 14:30:00 UTC
 *   06:00:00 UTC → 06:00:00 UTC
 *
 * @param {number} nowMs - Date.now()
 * @returns {Date} - Date con segundos/milisegundos en cero, minuto en :00 o :30
 */
const computeTick = (nowMs) => {
  const THIRTY_MIN_MS = 30 * 60 * 1000;
  return new Date(Math.floor(nowMs / THIRTY_MIN_MS) * THIRTY_MIN_MS);
};

/**
 * Extrae la hora y el minuto de un Date en la timezone de Argentina,
 * usando Intl.DateTimeFormat (sin hardcodear el offset UTC-3).
 *
 * @param {Date} date
 * @returns {{ hour: number, minute: number }}
 */
const getArTime = (date) => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute').value, 10);

  // Intl puede devolver 24 para la medianoche en algunos entornos; normalizamos.
  return { hour: hour === 24 ? 0 : hour, minute };
};

// ── Lógica de matcheo ────────────────────────────────────────────────────────

/**
 * Determina si un job debe correr en el tick dado.
 *
 * @param {{ type: string, minute?: number, hour?: number }} when
 * @param {Date} tick
 * @param {{ hour: number, minute: number }} arTime - hora AR del tick (calculada una sola vez)
 * @returns {boolean}
 */
const isDue = (when, tick, arTime) => {
  switch (when.type) {
    case 'every-tick':
      return true;

    case 'utc-minute':
      return tick.getUTCMinutes() === when.minute;

    case 'ar-time':
      return arTime.hour === when.hour && arTime.minute === when.minute;

    default:
      // Tipo desconocido — loguear y saltar (nunca crashear)
      console.warn(`[Scheduler] when.type desconocido: '${when.type}' — job omitido`);
      return false;
  }
};

// ── Formatter de ISO legible ─────────────────────────────────────────────────

/**
 * Formatea un Date como "HH:mm" en hora Argentina, para los logs.
 *
 * @param {Date} date
 * @returns {string}
 */
const formatArHHmm = (date) => {
  const { hour, minute } = getArTime(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Entry point del dispatcher run-once.
 *
 * Railway ejecuta este script en cada tick del Cron Schedule (cada 30 min).
 * El proceso calcula qué jobs corresponden al tick actual, los dispara en
 * secuencia y termina con exit(0).
 *
 * Exit code:
 *   0 — siempre (incluso si algún job falló HTTP/red). Los fallos se loguean
 *       pero no son crash del dispatcher — Railway no debe marcar la ejecución
 *       como fallida por un 5xx puntual del backend.
 *   1 — solo si config.js detecta variables de entorno faltantes (sale antes
 *       de llegar aquí).
 *
 * Edge case: si Railway demora el lanzamiento más allá del próximo límite de
 * 30 min (rarísimo), el tick calculado salta al boundary más reciente y los
 * jobs del tick perdido se omiten. Los frecuentes corren en el tick siguiente;
 * los diarios se pierden una vez (queda implícito en los logs porque el tick
 * no matchea su horario AR esperado).
 */
const main = async () => {
  const tick = computeTick(Date.now());
  const arTime = getArTime(tick);
  const arHHmm = formatArHHmm(tick);

  // Determinar qué jobs corren en este tick
  const dueJobs = JOBS.filter((job) => isDue(job.when, tick, arTime));
  const dueNames = dueJobs.map((j) => j.name);

  const jobsLabel = dueNames.length > 0 ? dueNames.join(', ') : 'ninguno';
  console.log(
    `[Scheduler] Tick ${tick.toISOString()} (AR ${arHHmm}) — jobs due: [${jobsLabel}]`
  );

  // Ejecutar en secuencia
  const results = [];
  for (const job of dueJobs) {
    console.log(`[Scheduler] Disparando: ${job.name}`);
    await triggerJob(job.name);
    results.push(job.name);
  }

  // Resumen final
  if (results.length > 0) {
    console.log(`[Scheduler] Tick completado. Jobs disparados: [${results.join(', ')}]`);
  } else {
    console.log('[Scheduler] Tick completado. Sin jobs para este intervalo.');
  }

  process.exit(0);
};

main().catch((err) => {
  // Solo debería llegar aquí ante un error inesperado fuera de triggerJob
  // (triggerJob nunca lanza). Loguear y salir con 0 de todas formas.
  console.error('[Scheduler] Error inesperado en el dispatcher:', err);
  process.exit(0);
});
