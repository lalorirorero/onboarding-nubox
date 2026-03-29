# Runbook - Separación de Base de Datos Nubox

Este runbook deja trazabilidad para crear una base independiente para Nubox sin romper Geo.

## 1) Provisionar nuevo proyecto Supabase (Nubox)

- Crear proyecto nuevo en Supabase (región según requerimiento comercial/latencia).
- Guardar secretos en vault interno:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `POSTGRES_URL` (solo administración).

## 2) Aplicar migraciones del repo Nubox

Aplicar en orden:

1. `supabase/migrations/20260319104200_001_create_onboardings_table.sql`
2. `supabase/migrations/20260319104300_002_compliance_core.sql`
3. `supabase/migrations/20260319104400_003_compliance_retention.sql`
4. `supabase/migrations/20260325103000_004_security_rls_and_search_path.sql`

## 3) Configurar Vercel (proyecto Nubox)

En `onboarding-nubox-separado`:

- Actualizar variables:
  - `SUPABASE_URL` (nuevo proyecto Nubox).
  - `SUPABASE_ANON_KEY` (nuevo proyecto Nubox).
  - `SUPABASE_SERVICE_ROLE_KEY` (nuevo proyecto Nubox).
  - `CRON_SECRET` (nuevo secreto exclusivo de Nubox).
  - `ZOHO_FLOW_TEST_URL` (endpoint Nubox dedicado).

## 4) Validaciones de cumplimiento (post-migración)

- RLS habilitado en:
  - `onboardings`
  - `onboarding_consents`
  - `data_subject_requests`
  - `onboarding_history`
  - `onboarding_excels`
- Funciones con `search_path` fijo:
  - `run_onboarding_retention`
  - `prune_onboarding_history`
  - `anonymize_onboarding`
  - `mark_onboarding_access`
- Endpoint de retención responde:
  - `401` sin secreto
  - `200` con secreto válido

## 5) Smoke test funcional

1. Generar link de onboarding desde endpoint.
2. Completar flujo mínimo en frontend.
3. Verificar inserción en tablas de cumplimiento.
4. Verificar envío a endpoint Zoho Nubox.
5. Confirmar que Geo no recibe tráfico Nubox.

