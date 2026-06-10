# growe-cron-scheduler

Scheduler HTTP delgado para los cron jobs de Growe.

La **lógica de negocio** de cada job vive íntegramente en el backend. Este servicio solo
determina qué jobs deben correr y, en cada ejecución, realiza los
`POST {API_BASE_URL}/api/internal/jobs/{job-name}` correspondientes con el header de
autenticación `X-Internal-Job-Secret`. El backend ejecuta cada job y devuelve el
resultado; el scheduler loguea el outcome y descarta cualquier estado.

---

## Modos de operación

### Modo Railway Cron (recomendado / default)

El proceso corre como un **Cron Schedule de Railway**: Railway lo lanza cada 30 minutos
(`*/30 * * * *` UTC), el proceso determina qué jobs corresponden al tick actual, los
dispara en secuencia y **termina** (`process.exit(0)`). No queda ningún proceso vivo
entre ejecuciones.

**Configuración en Railway:**

1. En el servicio → **Settings → Deploy → Cron Schedule**: `*/30 * * * *`
2. El start command default (`npm start` → `node run-due-jobs.js`) es el correcto.
3. Definir las variables de entorno (ver tabla más abajo).

**¿Qué job corre en qué tick?**

| Nombre del job | Cuándo corre |
|---|---|
| `workout-unfinished-reminder` | Todos los ticks — cada :00 y :30 UTC |
| `training-reminder` | Ticks con minuto UTC = 0 (cada hora en punto) |
| `premium-expiration` | Tick cuya hora en AR es 00:00 |
| `planning-scheduled-promotion` | Tick cuya hora en AR es 00:00 (después de premium-expiration) |
| `exercise-media-cleanup` | Tick cuya hora en AR es 03:00 |
| `draft-cleanup` | Tick cuya hora en AR es 03:30 |

> **Nota sobre premium-expiration y planning-scheduled-promotion:** en el modo daemon
> corren a las 00:05 y 00:15 AR respectivamente — el offset servía para escalonar
> ejecuciones dentro del proceso. En el modo Railway Cron ambos se despachan en el
> tick de 00:00 AR pero en **secuencia** (primero premium-expiration, luego
> planning-scheduled-promotion), por lo que el escalonamiento ya no es necesario.

**¿Qué pasa si Railway demora el lanzamiento?**

El dispatcher redondea `Date.now()` hacia abajo al límite de 30 minutos más cercano
(tick intencional), tolerando retrasos de lanzamiento normales. Si el retraso fuera
mayor a 30 minutos (rarísimo), el tick calculado salta al boundary más reciente y los
jobs del tick omitido se saltan: los frecuentes corren en el tick siguiente; los diarios
se pierden esa vez.

---

### Modo daemon

Para hosts sin cron nativo (VPS con systemd, Render worker, etc.).

```bash
npm run daemon
# equivalente a: node index.js
```

El proceso queda vivo indefinidamente, registra los 6 schedules con `node-cron` y
dispara cada job según su cron expression y timezone. Para detenerlo: `Ctrl+C` (SIGINT)
o `kill <pid>` (SIGTERM).

**Schedules del modo daemon:**

| Nombre | Schedule (cron) | Timezone |
|---|---|---|
| `workout-unfinished-reminder` | `*/30 * * * *` (cada 30 min) | Hora del servidor |
| `training-reminder` | `0 * * * *` (cada hora en punto) | Hora del servidor |
| `premium-expiration` | `5 0 * * *` (00:05 diario) | America/Argentina/Buenos_Aires |
| `planning-scheduled-promotion` | `15 0 * * *` (00:15 diario) | America/Argentina/Buenos_Aires |
| `exercise-media-cleanup` | `0 3 * * *` (03:00 diario) | America/Argentina/Buenos_Aires |
| `draft-cleanup` | `30 3 * * *` (03:30 diario) | America/Argentina/Buenos_Aires |

---

## Variables de entorno

Copiar `.env.example` a `.env` y completar los valores:

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `API_BASE_URL` | Sí | — | URL base del backend (ej. `https://growe-api.up.railway.app`). Sin barra final. |
| `INTERNAL_JOBS_SECRET` | Sí | — | Secret compartido con el backend (`INTERNAL_JOBS_SECRET`). Nunca se loguea. |
| `REQUEST_TIMEOUT_MS` | No | `120000` | Timeout en ms para cada petición HTTP al backend. |
| `MAX_RETRIES` | No | `2` | Reintentos ante errores de red/timeout. Los errores HTTP nunca se reintentan. |
| `RETRY_DELAY_MS` | No | `5000` | Espera en ms entre reintentos. |

Si `API_BASE_URL` o `INTERNAL_JOBS_SECRET` no están definidas, el proceso termina al
arrancar con un mensaje de error claro.

---

## Política de reintentos

| Situación | Comportamiento |
|---|---|
| Error de red / timeout | Reintenta hasta `MAX_RETRIES` veces con pausa de `RETRY_DELAY_MS` ms |
| `409` (job ya en ejecución) | Loguea "ya en ejecución, se omite" y no reintenta |
| Cualquier otro `4xx` | Loguea el error y no reintenta (error determinista) |
| `5xx` | Loguea el error y no reintenta (el job pudo haber corrido parcialmente) |
| `2xx` | Loguea `stats` y `duration_ms` de la response |

En el modo Railway Cron, un fallo HTTP/red de un job no crashea el dispatcher —
se loguea y el proceso termina con `exit(0)`. Railway no marca la ejecución como
fallida por errores del backend.

---

## Correr localmente

```bash
npm install
cp .env.example .env
# Editar .env con los valores reales

# Modo Railway Cron (corre una vez y termina):
npm start

# Modo daemon (queda vivo):
npm run daemon
```

---

## Deploy

### Railway (modo Cron Schedule — recomendado)

1. Crear un nuevo servicio en Railway (mismo proyecto que el backend).
2. Apuntar al repo de este scheduler (o al subdirectorio si es monorepo).
3. En **Settings → Deploy → Cron Schedule**: `*/30 * * * *`
4. Definir las variables de entorno en el dashboard.
5. Start command: `npm start` (default; ejecuta `node run-due-jobs.js`).

### Railway (modo daemon — alternativo)

Igual que arriba pero **sin configurar Cron Schedule** y con start command
`npm run daemon`. El proceso queda vivo y Railway lo reinicia ante crashes.

### Render / VPS

Análogo: cualquier servicio que ejecute `node run-due-jobs.js` (con cron del SO)
o `node index.js` (daemon) en un entorno Node ≥ 18 con las variables de entorno
configuradas.

---

## Requisito previo en el backend

El backend debe tener configurada la variable de entorno `INTERNAL_JOBS_SECRET`
con el mismo valor que este scheduler. Sin ese secret, el backend responde `503`
a todas las peticiones de jobs.

---

## Secuencia de cutover (migración desde cron in-process)

Los cron jobs actualmente corren dentro del proceso del backend (via `node-cron`
in-process en `src/cron/index.js`). Para migrar al scheduler externo sin downtime:

1. **Deploy del backend con el endpoint interno:** asegurarse de que el backend
   tenga implementado `POST /api/internal/jobs/:jobName` y la variable
   `INTERNAL_JOBS_SECRET` configurada en Railway.

2. **Deploy del scheduler externo:** deployar este servicio con `API_BASE_URL`
   apuntando al backend y `INTERNAL_JOBS_SECRET` con el mismo valor. En este
   punto ambos sistemas conviven — los jobs se ejecutan dos veces por disparo.
   Verificar en los logs del scheduler que los POSTs devuelven `200`.

3. **Deshabilitar los cron in-process:** en el backend de Railway, setear la
   variable de entorno `ENABLE_CRON_JOBS=false` y reiniciar el servicio. A partir
   de ese momento solo el scheduler externo dispara los jobs.

4. **Rollback (si es necesario):** volver a `ENABLE_CRON_JOBS=true` en el backend
   y detener/eliminar el scheduler externo. Los jobs vuelven a correr in-process.
