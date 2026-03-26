-- Compliance core for onboarding data governance
-- Safe to run multiple times (idempotent).

-- 1) Extend onboardings with compliance/security metadata
ALTER TABLE IF EXISTS onboardings
  ADD COLUMN IF NOT EXISTS source_crm TEXT,
  ADD COLUMN IF NOT EXISTS source_partner TEXT,
  ADD COLUMN IF NOT EXISTS processing_purpose TEXT,
  ADD COLUMN IF NOT EXISTS legal_basis TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT,
  ADD COLUMN IF NOT EXISTS privacy_notice_shown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_notice_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS representative_declaration_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_access_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_access_ip INET,
  ADD COLUMN IF NOT EXISTS last_access_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS retention_delete_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS compliance_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS onboardings
  ADD CONSTRAINT chk_onboardings_link_access_count_non_negative
  CHECK (link_access_count >= 0) NOT VALID;

-- Validate only if it exists and is not validated yet
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_onboardings_link_access_count_non_negative'
      AND convalidated = false
  ) THEN
    ALTER TABLE onboardings VALIDATE CONSTRAINT chk_onboardings_link_access_count_non_negative;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboardings_token_expires_at ON onboardings(token_expires_at);
CREATE INDEX IF NOT EXISTS idx_onboardings_retention_delete_at ON onboardings(retention_delete_at);
CREATE INDEX IF NOT EXISTS idx_onboardings_deleted_at ON onboardings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_onboardings_anonymized_at ON onboardings(anonymized_at);
CREATE INDEX IF NOT EXISTS idx_onboardings_source_crm ON onboardings(source_crm);

COMMENT ON COLUMN onboardings.source_crm IS 'CRM origen de la sesión (zoho_crm, hubspot, partner_crm, etc.)';
COMMENT ON COLUMN onboardings.source_partner IS 'Identificador del partner cuando aplica integración multicliente';
COMMENT ON COLUMN onboardings.processing_purpose IS 'Finalidad principal del tratamiento informada al titular';
COMMENT ON COLUMN onboardings.legal_basis IS 'Base de licitud (consentimiento, ejecución contractual, obligación legal, etc.)';
COMMENT ON COLUMN onboardings.policy_version IS 'Versión del texto legal informado al titular';
COMMENT ON COLUMN onboardings.privacy_notice_shown_at IS 'Fecha/hora en que se mostró la información de privacidad';
COMMENT ON COLUMN onboardings.privacy_notice_accepted_at IS 'Fecha/hora en que se aceptó la información de privacidad';
COMMENT ON COLUMN onboardings.representative_declaration_accepted IS 'Declaración de representante autorizado para cargar datos de terceros';
COMMENT ON COLUMN onboardings.token_expires_at IS 'Expiración del enlace/token de onboarding';
COMMENT ON COLUMN onboardings.link_used_at IS 'Primera o última vez de uso del enlace';
COMMENT ON COLUMN onboardings.link_access_count IS 'Cantidad de accesos al enlace';
COMMENT ON COLUMN onboardings.retention_delete_at IS 'Fecha objetivo de supresión o anonimización';
COMMENT ON COLUMN onboardings.deleted_at IS 'Marca de borrado lógico';
COMMENT ON COLUMN onboardings.anonymized_at IS 'Fecha de anonimización del registro';
COMMENT ON COLUMN onboardings.compliance_metadata IS 'Metadatos de cumplimiento y auditoría legal';

-- 2) Consent/audit events (privacy notice + declarations + optional marketing)
CREATE TABLE IF NOT EXISTS onboarding_consents (
  id BIGSERIAL PRIMARY KEY,
  onboarding_id UUID NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  legal_text_hash TEXT,
  ip_address INET,
  user_agent TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE onboarding_consents
  ADD CONSTRAINT chk_onboarding_consents_subject_type
  CHECK (subject_type IN ('empresa_representante', 'titular', 'partner_user')) NOT VALID;

ALTER TABLE onboarding_consents
  ADD CONSTRAINT chk_onboarding_consents_event_type
  CHECK (
    event_type IN (
      'privacy_notice_shown',
      'privacy_notice_accepted',
      'representative_declaration_accepted',
      'marketing_opt_in',
      'marketing_opt_out'
    )
  ) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_onboarding_consents_subject_type' AND convalidated = false
  ) THEN
    ALTER TABLE onboarding_consents VALIDATE CONSTRAINT chk_onboarding_consents_subject_type;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_onboarding_consents_event_type' AND convalidated = false
  ) THEN
    ALTER TABLE onboarding_consents VALIDATE CONSTRAINT chk_onboarding_consents_event_type;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_onboarding_consents_onboarding_id ON onboarding_consents(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_consents_created_at ON onboarding_consents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_consents_event_type ON onboarding_consents(event_type);

COMMENT ON TABLE onboarding_consents IS 'Evidencia legal de avisos y aceptaciones vinculadas al onboarding';

-- 3) Data subject rights requests (ARCO/portabilidad/bloqueo)
CREATE TABLE IF NOT EXISTS data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID REFERENCES onboardings(id) ON DELETE SET NULL,
  id_zoho TEXT,
  source_crm TEXT,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'recibida',
  requested_by_name TEXT,
  requested_by_email TEXT,
  requested_by_rut TEXT,
  request_details TEXT,
  resolution_notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '20 days'),
  closed_at TIMESTAMPTZ,
  handled_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE data_subject_requests
  ADD CONSTRAINT chk_data_subject_requests_request_type
  CHECK (request_type IN ('acceso', 'rectificacion', 'supresion', 'oposicion', 'portabilidad', 'bloqueo')) NOT VALID;

ALTER TABLE data_subject_requests
  ADD CONSTRAINT chk_data_subject_requests_status
  CHECK (status IN ('recibida', 'en_revision', 'en_proceso', 'resuelta', 'rechazada')) NOT VALID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_data_subject_requests_request_type' AND convalidated = false
  ) THEN
    ALTER TABLE data_subject_requests VALIDATE CONSTRAINT chk_data_subject_requests_request_type;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_data_subject_requests_status' AND convalidated = false
  ) THEN
    ALTER TABLE data_subject_requests VALIDATE CONSTRAINT chk_data_subject_requests_status;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_status_due_at ON data_subject_requests(status, due_at);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_onboarding_id ON data_subject_requests(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_data_subject_requests_requested_at ON data_subject_requests(requested_at DESC);

COMMENT ON TABLE data_subject_requests IS 'Solicitudes de derechos de titulares y su ciclo de gestión';
