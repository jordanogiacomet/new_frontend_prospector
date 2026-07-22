-- Roll back the Prospecta v1 producer-owned import acceptance objects.
-- Refuse to erase durable acceptance history.

DO $$
DECLARE
  v_has_acceptances boolean := false;
BEGIN
  IF to_regclass('public.prospecta_import_acceptances') IS NOT NULL THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.prospecta_import_acceptances)'
      INTO v_has_acceptances;
  END IF;

  IF v_has_acceptances THEN
    RAISE EXCEPTION
      'Refusing to remove Prospecta import acceptance objects with durable history';
  END IF;
END;
$$;

DROP VIEW IF EXISTS public.prospecta_import_acceptances_v1;
DROP FUNCTION IF EXISTS public.prospecta_accept_empresaqui_batch_v1(jsonb);
DROP TABLE IF EXISTS public.prospecta_import_acceptances;
