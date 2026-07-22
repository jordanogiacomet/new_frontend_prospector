-- Prospecta v1 producer-owned explicit batch close.
-- Apply only by a producer owner to an explicitly approved target.

CREATE FUNCTION public.prospecta_close_empresaqui_batch_v1(
  p_close jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_import_batch_id text := p_close->>'import_batch_id';
  v_contract_version text := p_close->>'contract_version';
  v_close_reason text := p_close->>'close_reason';
  v_manifest jsonb;
  v_closed_at timestamptz;
BEGIN
  IF jsonb_typeof(p_close) <> 'object'
     OR v_import_batch_id IS NULL
     OR v_import_batch_id !~ '^ib_[0-9a-f]{64}$'
     OR v_contract_version IS DISTINCT FROM 'prospecta-import-v1'
     OR v_close_reason IS DISTINCT FROM
       'WORKER_ORCHESTRATION_FINISHED' THEN
    RAISE EXCEPTION 'Invalid Prospecta batch close payload'
      USING ERRCODE = '22023';
  END IF;

  SELECT batches.import_manifest
  INTO v_manifest
  FROM public.lead_import_batches AS batches
  WHERE batches.import_batch_id = v_import_batch_id
    AND EXISTS (
      SELECT 1
      FROM public.prospecta_import_acceptances AS acceptance
      WHERE acceptance.import_batch_id = batches.import_batch_id
        AND acceptance.contract_version = v_contract_version
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospecta accepted batch not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_manifest->>'prospecta_batch_closed' = 'true' THEN
    IF v_manifest->>'prospecta_batch_close_contract_version'
         IS DISTINCT FROM v_contract_version
       OR v_manifest->>'prospecta_batch_close_reason'
         IS DISTINCT FROM v_close_reason
       OR COALESCE(
         v_manifest->>'prospecta_batch_closed_at',
         ''
       ) !~
         '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' THEN
      RAISE EXCEPTION 'Conflicting Prospecta batch close replay'
        USING ERRCODE = '23505';
    END IF;

    v_closed_at :=
      (v_manifest->>'prospecta_batch_closed_at')::timestamptz;

    RETURN jsonb_build_object(
      'closed', true,
      'import_batch_id', v_import_batch_id,
      'close_reason', v_close_reason,
      'contract_version', v_contract_version,
      'closed_at', v_closed_at,
      'replayed', true
    );
  END IF;

  v_closed_at := clock_timestamp();

  UPDATE public.lead_import_batches
  SET
    import_manifest =
      COALESCE(import_manifest, '{}'::jsonb) ||
      jsonb_build_object(
        'prospecta_batch_closed', true,
        'prospecta_batch_closed_at', v_closed_at,
        'prospecta_batch_close_reason', v_close_reason,
        'prospecta_batch_close_contract_version', v_contract_version
      ),
    last_seen_at = GREATEST(last_seen_at, v_closed_at)
  WHERE import_batch_id = v_import_batch_id;

  RETURN jsonb_build_object(
    'closed', true,
    'import_batch_id', v_import_batch_id,
    'close_reason', v_close_reason,
    'contract_version', v_contract_version,
    'closed_at', v_closed_at,
    'replayed', false
  );
END;
$$;

COMMENT ON FUNCTION public.prospecta_close_empresaqui_batch_v1(jsonb)
IS 'Records an explicit idempotent close fact without creating or changing row terminal outcomes.';

REVOKE ALL ON FUNCTION
  public.prospecta_close_empresaqui_batch_v1(jsonb)
  FROM PUBLIC;
