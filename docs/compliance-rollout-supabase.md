# Compliance Rollout (Supabase)

Este documento resume como aplicar las migraciones de cumplimiento sin romper el flujo actual.

## Archivos

- `scripts/002-compliance-core.sql`
- `scripts/003-compliance-retention.sql`
- `scripts/004-security-rls-and-search-path.sql`

## Orden de ejecucion

1. Ejecutar `001-create-onboardings-table.sql` (si aun no existe la tabla base).
2. Ejecutar `002-compliance-core.sql`.
3. Ejecutar `003-compliance-retention.sql`.
4. Ejecutar `004-security-rls-and-search-path.sql`.

## Que agrega cada migracion

### 002-compliance-core.sql

- Nuevas columnas en `onboardings` para:
  - trazabilidad legal (policy/version/base legal),
  - seguridad del link/token (expiracion, accesos, IP/UA),
  - retencion y borrado logico.
- Tabla `onboarding_consents` para evidencia de avisos/aceptaciones.
- Tabla `data_subject_requests` para gestionar derechos de titulares.

### 003-compliance-retention.sql

- Trigger para definir retencion por defecto.
- Funcion `mark_onboarding_access(...)` para contar accesos al link.
- Funcion `anonymize_onboarding(...)` para anonimizar.
- Funcion `run_onboarding_retention(...)` para proceso batch.
- Funcion `prune_onboarding_history(...)` para depurar historicos antiguos.

### 004-security-rls-and-search-path.sql

- Habilita RLS en:
  - `onboardings`
  - `onboarding_consents`
  - `data_subject_requests`
  - `onboarding_excels`
  - `onboarding_history`
- Revoca acceso directo para `anon` y `authenticated` en esas tablas.
- Crea politicas operativas para `service_role`.
- Corrige warnings de `function_search_path_mutable` fijando `search_path` en funciones de retencion.

## Como operarlo

- Job diario recomendado:
  - `select * from run_onboarding_retention(500);`
  - `select prune_onboarding_history(180);`

### Endpoints operativos agregados

- `POST /api/compliance/retention`
  - Ejecuta:
    - `run_onboarding_retention(p_limit)`
    - `prune_onboarding_history(p_keep_days)`
  - Body opcional:
    - `retentionLimit` (default `500`)
    - `historyKeepDays` (default `180`)
- `GET /api/compliance/retention`
  - Health check del endpoint (requiere el mismo secreto cuando esta configurado).
  - Si se invoca con `?run=true`, ejecuta retencion con defaults o con query params:
    - `retentionLimit` (default `500`)
    - `historyKeepDays` (default `180`)
- `POST /api/compliance/data-subject-requests`
  - Registra una solicitud de derechos del titular.
  - `requestType` permitido:
    - `acceso`, `rectificacion`, `supresion`, `oposicion`, `portabilidad`, `bloqueo`
- `GET /api/compliance/data-subject-requests`
  - Lista solicitudes con filtros opcionales por `status`, `requestType`, `idZoho` y `limit`.

### Seguridad de endpoints

- Si defines `COMPLIANCE_API_SECRET` (o `CRON_SECRET`), los endpoints anteriores exigen uno de estos headers:
  - `x-compliance-secret: <secret>`
  - `x-cron-secret: <secret>`
  - `Authorization: Bearer <secret>`
- Si no defines secreto, los endpoints quedan abiertos (solo recomendado para desarrollo local).

### Automatizacion (Vercel Cron)

- Se agrega `vercel.json` con ejecucion diaria:
  - `GET /api/compliance/retention?run=true`
  - Schedule: `0 6 * * *` (UTC).
- Para proteger el cron en produccion:
  - Definir `CRON_SECRET` en Vercel (Project Settings > Environment Variables).
  - Vercel enviara `Authorization: Bearer <CRON_SECRET>`.
  - El endpoint ya valida ese header via `isAuthorizedComplianceRequest(...)`.

## Integracion recomendada en API

- En `GET /api/onboarding/[id]`, llamar:
  - `select mark_onboarding_access(:id, :ip, :user_agent);`
- En generacion de link (`/api/generate-link`), definir:
  - `token_expires_at` (ej. `NOW() + interval '30 days'`).
- En finalizacion o primeros pasos, guardar evento en `onboarding_consents`.

## Importante

- Estas migraciones dejan RLS habilitado y requieren uso de `service_role` en backend para operar tablas sensibles.
- Los endpoints de compliance usan `SUPABASE_SERVICE_ROLE_KEY`; no dependen de cookies ni sesion del usuario final.
