# Dossier de Cumplimiento y Seguridad

## 1) Objetivo del documento

Este documento consolida, en un solo lugar, los controles legales y técnicos del sistema de auto-onboarding para presentar a las áreas de Seguridad TI y Cumplimiento de GeoVictoria y Nubox.

Estado: **Documento vivo** (se actualiza en cada cambio relevante).

Fecha de inicio del dossier: **26-03-2026**.

---

## 2) Alcance evaluado

- Aplicación de auto-onboarding (frontend + API routes).
- Integración con Zoho Flow por webhook.
- Persistencia de datos en Supabase.
- Operación de retención y evidencias de cumplimiento.

---

## 3) Referencia legal base (Chile)

Marco principal usado para el diseño:

- Ley N° 21.719 (protección y tratamiento de datos personales).
- Principios aplicados en la implementación:
  - Proporcionalidad y minimización de datos.
  - Seguridad por diseño y por defecto.
  - Conservación limitada y retención controlada.
  - Trazabilidad/auditoría sobre eventos relevantes.

Nota: este documento es técnico-operativo y no reemplaza revisión jurídica formal.

---

## 4) Matriz de cumplimiento (legal -> control implementado)

| Requisito / expectativa de cumplimiento | Control implementado | Evidencia técnica | Estado |
|---|---|---|---|
| Restringir acceso a datos personales en BD | RLS habilitado en tablas sensibles y políticas para `service_role` | `scripts/004-security-rls-and-search-path.sql`, `supabase/migrations/20260325103000_004_security_rls_and_search_path.sql` | Implementado |
| Evitar funciones DB con riesgo de `search_path` mutable | `ALTER FUNCTION ... SET search_path = public, pg_temp` | Migración `004` | Implementado |
| Trazabilidad de consentimientos/avisos legales | Tabla `onboarding_consents` + registro desde API | `scripts/002-compliance-core.sql`, `app/api/onboarding/[id]/route.ts` | Implementado |
| Gestión de solicitudes de titulares | Endpoint y tabla `data_subject_requests` | `app/api/compliance/data-subject-requests/route.ts`, migración `002` | Implementado |
| Conservación limitada de datos | Funciones `run_onboarding_retention` y `prune_onboarding_history` | `scripts/003-compliance-retention.sql`, endpoint retention | Implementado |
| Ejecución operativa automática de retención | Cron diario en Vercel sobre endpoint protegido | `vercel.json`, `app/api/compliance/retention/route.ts` | Implementado |
| Protección de endpoints de cumplimiento | Validación por secreto (`COMPLIANCE_API_SECRET` o `CRON_SECRET`) | `lib/compliance.ts` | Implementado |
| Integridad del flujo a Zoho Flow | Estructura de payload estable y envío validado | `app/api/submit-to-zoho/route.ts`, pruebas webhook | Implementado |
| Manejo robusto de respuesta Zoho 200 sin body | Fix para no falsos negativos de envío | `lib/backend.ts` | Implementado |

---

## 5) Registro de cambios aplicados (bitácora)

| Fecha | Commit | Cambio | Impacto de cumplimiento |
|---|---|---|---|
| 26-03-2026 | `524fffc` | Hardening RLS + search_path + uso `service_role` | Refuerza control de acceso y seguridad de BD |
| 26-03-2026 | `aee53ee` | Fix envío Zoho (`200` sin body) | Evita falsos errores en trazabilidad de envío |
| 26-03-2026 | `b051983` | Endpoints compliance + migraciones 001/002/003 | Habilita base técnica de cumplimiento |
| 26-03-2026 | `9a6d99e` | Cron diario de retención seguro | Operacionaliza conservación limitada |

---

## 6) Evidencias mínimas para auditoría interna

Checklist de evidencias recomendadas para presentar a Seguridad TI:

- `git log` con commits de cumplimiento.
- SQL de migraciones ejecutadas en Supabase.
- Capturas de advisor/linter sin errores críticos de RLS/search_path.
- Respuesta real de `/api/compliance/retention?run=true` con secreto válido.
- Evidencia de recepción de payloads en Zoho Flow History.
- Configuración de secretos en Vercel (`CRON_SECRET` activo).

---

## 7) Configuración operativa vigente

- Retención de onboarding completado: **365 días**.
- Retención de onboarding no completado: **120 días**.
- Limpieza de historial técnico (`onboarding_history`): **180 días**.
- Frecuencia cron: **diaria** (`0 6 * * *`, UTC).

---

## 8) Riesgos residuales y controles pendientes

Riesgos residuales actuales:

- Dependencia de correcta gestión/rotación de secretos (`CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`).
- Necesidad de validación jurídica final de textos legales y base de licitud por caso de uso.

Pendientes recomendados:

- Definir política de rotación formal de secretos (responsable + frecuencia).
- Documentar procedimiento de respuesta a incidentes de datos.
- Cerrar aprobación formal de Legal/Compliance sobre textos visibles al usuario.

---

## 9) Próximas actualizaciones del dossier

Cada cambio que afecte privacidad, retención, seguridad o integraciones externas debe agregar:

- Fecha.
- Commit.
- Descripción funcional.
- Riesgo mitigado.
- Evidencia de prueba.

