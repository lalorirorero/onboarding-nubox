-- Retention and anonymization routines for onboarding compliance
-- Safe to run multiple times (idempotent).

-- 1) Set a default retention date when missing
CREATE OR REPLACE FUNCTION set_default_onboarding_retention()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.retention_delete_at IS NULL THEN
    IF NEW.estado = 'completado' THEN
      NEW.retention_delete_at := NOW() + INTERVAL '365 days';
    ELSE
      NEW.retention_delete_at := NOW() + INTERVAL '120 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_onboarding_retention ON onboardings;
CREATE TRIGGER trg_set_default_onboarding_retention
BEFORE INSERT OR UPDATE OF estado, retention_delete_at
ON onboardings
FOR EACH ROW
EXECUTE FUNCTION set_default_onboarding_retention();

-- 2) Register token/link access from API when onboarding is opened
CREATE OR REPLACE FUNCTION mark_onboarding_access(
  p_onboarding_id UUID,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE onboardings
  SET
    link_used_at = NOW(),
    link_access_count = COALESCE(link_access_count, 0) + 1,
    last_access_ip = COALESCE(p_ip, last_access_ip),
    last_access_user_agent = COALESCE(p_user_agent, last_access_user_agent),
    fecha_ultima_actualizacion = NOW()
  WHERE id = p_onboarding_id
    AND deleted_at IS NULL;
END;
$$;

-- 3) Anonymize one onboarding row (PII minimization after retention date)
CREATE OR REPLACE FUNCTION anonymize_onboarding(p_onboarding_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_exists BOOLEAN;
  v_anon_id TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM onboardings
    WHERE id = p_onboarding_id
      AND deleted_at IS NULL
  )
  INTO v_exists;

  IF NOT v_exists THEN
    RETURN FALSE;
  END IF;

  v_anon_id := 'anon-' || LEFT(REPLACE(p_onboarding_id::TEXT, '-', ''), 12);

  UPDATE onboardings
  SET
    id_zoho = v_anon_id,
    datos_actuales = '{}'::jsonb,
    navigation_history = ARRAY[]::INTEGER[],
    ultimo_paso = 0,
    anonymized_at = NOW(),
    deleted_at = NOW(),
    fecha_ultima_actualizacion = NOW(),
    compliance_metadata = COALESCE(compliance_metadata, '{}'::jsonb) || jsonb_build_object(
      'anonymized_reason', 'retention_expired',
      'anonymized_at', NOW()
    )
  WHERE id = p_onboarding_id
    AND deleted_at IS NULL;

  RETURN TRUE;
END;
$$;

-- 4) Batch process expired records
CREATE OR REPLACE FUNCTION run_onboarding_retention(p_limit INTEGER DEFAULT 500)
RETURNS TABLE(processed_count INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_row RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT id
    FROM onboardings
    WHERE deleted_at IS NULL
      AND retention_delete_at IS NOT NULL
      AND retention_delete_at <= NOW()
    ORDER BY retention_delete_at ASC
    LIMIT GREATEST(p_limit, 1)
  LOOP
    IF anonymize_onboarding(v_row.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  processed_count := v_count;
  RETURN NEXT;
END;
$$;

-- 5) Optional helper: clear old history payloads if table exists
CREATE OR REPLACE FUNCTION prune_onboarding_history(p_keep_days INTEGER DEFAULT 180)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_sql TEXT;
BEGIN
  IF to_regclass('public.onboarding_history') IS NULL THEN
    RETURN 0;
  END IF;

  v_sql := format(
    'DELETE FROM public.onboarding_history WHERE created_at < NOW() - INTERVAL ''%s days''',
    GREATEST(p_keep_days, 1)
  );

  EXECUTE v_sql;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
