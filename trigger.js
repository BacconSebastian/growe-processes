'use strict';

const config = require('./config');

/**
 * Espera N milisegundos. Usado entre reintentos de red.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Realiza un único intento de POST al endpoint del backend para el job dado.
 * Lanza un error si la petición falla por red/timeout.
 * Resuelve con la Response de fetch para todos los demás casos (4xx, 5xx, 2xx).
 *
 * @param {string} name - Nombre del job (:jobName en la ruta del backend)
 * @returns {Promise<Response>}
 */
const attemptPost = async (name) => {
  const url = `${config.API_BASE_URL}/api/internal/jobs/${name}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Internal-Job-Secret': config.INTERNAL_JOBS_SECRET,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Intenta parsear el cuerpo de una Response como JSON de forma defensiva.
 * Si falla (body vacío, HTML de error, etc.) devuelve null.
 *
 * @param {Response} response
 * @returns {Promise<object|null>}
 */
const parseBody = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/**
 * Dispara el job indicado realizando un POST al backend.
 *
 * Política de reintentos:
 * - Errores de red / timeout → reintentar hasta MAX_RETRIES veces con pausa RETRY_DELAY_MS.
 * - 409 (job ya en ejecución) → loguear y no reintentar.
 * - Cualquier otro 4xx → loguear y no reintentar (error determinista).
 * - 5xx → loguear y no reintentar (el job pudo haber corrido parcialmente).
 * - 2xx → loguear stats y duration_ms de la response.
 *
 * La función nunca lanza — un fallo no debe tumbar el proceso principal.
 *
 * @param {string} name - Nombre del job a disparar
 * @returns {Promise<void>}
 */
const triggerJob = async (name) => {
  const prefix = `[Scheduler][${name}]`;
  let lastNetworkError = null;

  for (let attempt = 0; attempt <= config.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`${prefix} Reintento ${attempt}/${config.MAX_RETRIES} tras error de red. Esperando ${config.RETRY_DELAY_MS}ms...`);
      await sleep(config.RETRY_DELAY_MS);
    }

    let response;

    try {
      response = await attemptPost(name);
    } catch (networkError) {
      // Error de red o abort por timeout
      lastNetworkError = networkError;
      const isTimeout = networkError.name === 'AbortError';
      console.error(
        `${prefix} Error de ${isTimeout ? 'timeout' : 'red'} en intento ${attempt + 1}:`,
        networkError.message
      );
      // Continuar el loop para reintentar
      continue;
    }

    // A partir de aquí tenemos una Response HTTP — no reintentar independientemente del status.
    const body = await parseBody(response);
    const { status } = response;

    if (status === 200 || status === 201) {
      const stats = body && body.data ? body.data.stats : null;
      const duration = body && body.data ? body.data.duration_ms : null;
      console.log(
        `${prefix} OK (${status}) — duration_ms=${duration ?? 'n/a'}, stats=${stats ? JSON.stringify(stats) : 'n/a'}`
      );
      return;
    }

    if (status === 409) {
      console.log(`${prefix} El job ya está en ejecución, se omite (409).`);
      return;
    }

    // Cualquier otro 4xx o 5xx — loguear y no reintentar
    const message = body && body.error ? body.error.message : '(sin mensaje)';
    console.error(`${prefix} Error HTTP ${status}: ${message}`);
    return;
  }

  // Agotamos los reintentos por errores de red
  console.error(
    `${prefix} Se agotaron los reintentos (${config.MAX_RETRIES}). Último error: ${lastNetworkError ? lastNetworkError.message : 'desconocido'}`
  );
};

module.exports = { triggerJob };
