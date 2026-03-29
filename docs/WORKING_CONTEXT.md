# Contexto Operativo - Nubox Onboarding (Geo Managed)

## Identidad de la app

- `app_id`: `nubox`
- `repo`: `https://github.com/lalorirorero/v0-onboardingturnosmvp2`
- `rama base`: `nubox/main`
- `ruta local recomendada`: `C:\lalorirorero\repo-nubox`
- `proyecto vercel`: `onboarding-nubox-separado` (`prj_rzJWv1l2GOfOu2uWWlvnBEvKCI4m`)
- `url despliegue activo`: `https://onboarding-nubox-separado-8cfnwryen-egomez-4641s-projects.vercel.app`

## Base de datos

- `proveedor`: Supabase
- `objetivo de arquitectura`: BBDD separada de Geo (pendiente de provisionamiento del nuevo proyecto).
- `estado actual`: migraciones legales disponibles y listas para bootstrap en proyecto nuevo.

## Controles de cumplimiento implementados en código

- Consentimientos auditables (`onboarding_consents` + endpoint compliance).
- Derechos de titulares (`data_subject_requests` + endpoint API).
- Retención y purga (`run_onboarding_retention`, `prune_onboarding_history`).
- RLS y `search_path` fijo en funciones críticas.
- Validación por secreto en endpoint de retención (`COMPLIANCE_API_SECRET`/`CRON_SECRET`).
- Endurecimiento de token y sanitización de logs operativos sensibles.

## Preflight obligatorio antes de cambiar código

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status -sb
pnpm run build
```

## Riesgos de separación y mitigación

1. Riesgo: mezcla accidental de lógica Geo en Nubox.
   Mitigación: repo independiente + base branch exclusiva `nubox/main`.
2. Riesgo: despliegues duplicados o conflictivos en Vercel.
   Mitigación: proyecto dedicado (`onboarding-nubox-separado`) y control de `projectId`.
3. Riesgo: no separar BBDD a tiempo.
   Mitigación: cortar por etapas (schema legal, variables, endpoint, smoke test) antes de go-live partner.
4. Riesgo: exposición de datos en logs.
   Mitigación: logging minimizado y sin payload completo ni datos identificadores directos.

