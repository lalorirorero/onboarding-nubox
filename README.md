# Nubox Auto-Onboarding (Geo Managed)

Repositorio dedicado para la variante Nubox del flujo de auto-onboarding.

## Alcance

- Producto: onboarding para clientes del canal partner Nubox.
- Operacion: gestionado por GeoVictoria.
- Integraciones: CRM/Flow del partner + Supabase dedicado + Vercel dedicado.

## Separacion de apps

Este repositorio es independiente del repo Geo.

- Repo Nubox: `https://github.com/lalorirorero/onboarding-nubox`
- Repo Geo: `https://github.com/lalorirorero/onboarding-geovictoria`

Regla operativa: no portar cambios entre repos sin revision explicita.

## Flujo funcional resumido

1. CRM partner gatilla generacion de link (`/api/generate-link`).
2. Cliente completa onboarding en la app Nubox.
3. La app envia progreso/finalizacion al endpoint de integracion definido para Nubox.
4. Persistencia y cumplimiento se registran en Supabase Nubox.

## Requisitos locales

- Node.js 20+
- pnpm 9+
- Variables de entorno en `.env.local`

Variables minimas:

- `NEXT_PUBLIC_BASE_URL`
- `ZOHO_FLOW_TEST_URL` (endpoint del partner para Nubox)
- `SUPABASE_URL` (proyecto Nubox)
- `SUPABASE_SERVICE_ROLE_KEY` (proyecto Nubox)
- `NEXT_PUBLIC_SUPABASE_URL` (proyecto Nubox)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (proyecto Nubox)
- `CRON_SECRET` (o `COMPLIANCE_API_SECRET`)

## Ejecucion local

```bash
pnpm install
pnpm dev
```

App local: `http://localhost:3000`

## Validaciones recomendadas antes de push

```bash
pnpm build
git status -sb
```

## Despliegue

- Plataforma: Vercel
- Proyecto Nubox: `onboarding-nubox-separado`
- Entornos separados de Geo (repositorio, proyecto, secrets y base de datos).

## Controles de cumplimiento implementados

- Registro de consentimientos auditables.
- Endpoint para solicitudes de derechos de titulares.
- Retencion automatizada y purga.
- RLS en tablas sensibles.
- Funciones SQL con `search_path` fijo.
- Endpoints de cumplimiento protegidos por secreto.

## Documentacion util

- `docs/WORKING_CONTEXT.md`
- `docs/DB_SPLIT_RUNBOOK.md`
- `PROTECCION_DATOS.md`
- `docs/compliance-rollout-supabase.md`
- `docs/compliance-security-dossier.md`

## Convenciones de ramas

- Rama estable: `main`
- Cambios: rama feature -> PR -> merge a `main`
- Nunca commitear secretos ni `.env.local`
