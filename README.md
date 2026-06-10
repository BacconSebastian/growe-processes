# growe-cron-scheduler

Scheduler HTTP delgado para los cron jobs de Growe.

La **lógica de negocio** de cada job vive íntegramente en el backend. Este servicio solo
registra los schedules con `node-cron` y, en cada disparo, realiza un
`POST {API_BASE_URL}/api/internal/jobs/{job-name}` con el header de autenticación
`X-Internal-Job-Secret`. El backend ejecuta el job y devuelve el resultado; el
scheduler loguea el outcome y descarta cualquier estado.

---

## Jobs registrados

| Nombre | Schedule (cron) | Timezone |
|---|---|---|
| `training-reminder` | `0 * * * *` (cada hora en punto) | Hora del servidor |
| `workout-unfinished-reminder` | `*/30 * * * *` (cada 30 min) | Hora del servidor |
| `premium-expiration` | `5 0 * * *` (00:05 diario) | America/Argentina/Buenos_Aires |
| `planning-scheduled-promotion` | `15 0 * * *` (00:15 diario) | America/Argentina/Buenos_Aires |
| `exercise-media-cleanup` | `0 3 * * *` (03:00 diario) | America/Argentina/Buenos_Aires |
| `draft-cleanup` | `30 3 * * *` (03:30 diario) | America/Argentina/Buenos_Aires |

Los dos primeros jobs corren en la hora del proceso del servidor (sin timezone explícita),
igual que el comportamiento original de los cron in-process del backend. Los cuatro
jobs diarios usan `America/Argentina/Buenos_Aires` para que el horario se mantenga
independientemente del TZ del servidor donde se deploya el scheduler.

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

Un fallo nunca tumba el proceso — el catch-all en `trigger.js` garantiza que el
scheduler siga corriendo para los próximos disparos.

---

## Correr localmente

```bash
npm install
cp .env.example .env
# Editar .env con los valores reales
npm start
```

El proceso queda en primer plano logueando cada disparo. Para detenerlo: `Ctrl+C`
(SIGINT) o `kill <pid>` (SIGTERM).

---

## Deploy

Este servicio se deploya como un **proceso Node independiente** en cualquier
plataforma que soporte Node 18+ (Railway, Render, VPS, etc.).

El comando de inicio es simplemente `npm start` (`node index.js`).

No necesita base de datos, disco persistente ni dependencias externas — solo
conectividad HTTP hacia el backend.

### Railway

1. Crear un nuevo servicio en el mismo proyecto de Railway donde vive el backend.
2. Apuntar al repo de este scheduler (o al subdirectorio si se usa monorepo).
3. Definir las variables de entorno en el dashboard.
4. El servicio inicia automáticamente con `npm start`.

### Render / VPS

Análogo: cualquier servicio que ejecute `node index.js` en un entorno Node ≥ 18
con las variables de entorno configuradas.

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
   y detener el scheduler externo. Los jobs vuelven a correr in-process.
