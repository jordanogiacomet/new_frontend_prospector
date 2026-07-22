-- Prospecta v1 producer-owned atomic import acceptance.
-- Apply only by a producer owner to an explicitly approved target.
-- Prospecta runtime roles must never execute this migration.

CREATE TABLE public.prospecta_import_acceptances (
  submission_id text PRIMARY KEY,
  import_batch_id text NOT NULL,
  uploaded_file_sha256 text NOT NULL,
  idempotency_key_hash text NOT NULL,
  contract_version text NOT NULL,
  accepted_row_count integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prospecta_import_acceptances_submission_id_ck
    CHECK (
      submission_id ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ),
  CONSTRAINT prospecta_import_acceptances_batch_id_ck
    CHECK (import_batch_id ~ '^ib_[0-9a-f]{64}$'),
  CONSTRAINT prospecta_import_acceptances_file_sha_ck
    CHECK (uploaded_file_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT prospecta_import_acceptances_idempotency_hash_ck
    CHECK (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT prospecta_import_acceptances_contract_ck
    CHECK (contract_version = 'prospecta-import-v1'),
  CONSTRAINT prospecta_import_acceptances_row_count_ck
    CHECK (accepted_row_count >= 1),
  CONSTRAINT prospecta_import_acceptances_batch_fk
    FOREIGN KEY (import_batch_id)
    REFERENCES public.lead_import_batches(import_batch_id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX prospecta_import_acceptances_batch_idx
  ON public.prospecta_import_acceptances (import_batch_id, accepted_at DESC);

REVOKE ALL ON public.prospecta_import_acceptances FROM PUBLIC;

CREATE FUNCTION public.prospecta_accept_empresaqui_batch_v1(
  p_acceptance jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_submission_id text := p_acceptance->>'submission_id';
  v_app_idempotency_key text := p_acceptance->>'idempotency_key';
  v_file_sha256 text := p_acceptance->>'file_sha256';
  v_contract_version text := p_acceptance->>'contract_version';
  v_workflow_version text := p_acceptance->>'workflow_version';
  v_ruleset_version text := p_acceptance->>'ruleset_version';
  v_prompt_model_version text := p_acceptance->>'prompt_model_version';
  v_execution_mode text := p_acceptance->>'execution_mode';
  v_raw_rows_sha256 text := p_acceptance->>'raw_rows_sha256';
  v_header_sha256 text := p_acceptance->>'header_sha256';
  v_rows jsonb := p_acceptance->'rows';
  v_import_manifest jsonb := p_acceptance->'import_manifest';
  v_row jsonb;
  v_row_count integer;
  v_distinct_source_rows integer;
  v_source_row integer;
  v_raw_row_sha256 text;
  v_normalized_row_sha256 text;
  v_cnpj_normalizado text;
  v_import_batch_id text;
  v_input_row_id text;
  v_idempotency_key text;
  v_lead_run_id text;
  v_decision_id text;
  v_claim jsonb;
  v_claim_batch_id text;
  v_durable_row_count integer;
  v_idempotency_key_hash text;
  v_accepted_at timestamptz;
  v_existing public.prospecta_import_acceptances%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_acceptance) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Prospecta import acceptance payload'
      USING ERRCODE = '22023';
  END IF;

  IF v_submission_id IS NULL
     OR v_submission_id !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid Prospecta submission identity'
      USING ERRCODE = '22023';
  END IF;

  IF v_app_idempotency_key IS NULL
     OR btrim(v_app_idempotency_key) <> v_app_idempotency_key
     OR length(v_app_idempotency_key) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid Prospecta import idempotency identity'
      USING ERRCODE = '22023';
  END IF;

  IF v_file_sha256 IS NULL
     OR v_file_sha256 !~ '^[0-9a-f]{64}$'
     OR v_raw_rows_sha256 IS NULL
     OR v_raw_rows_sha256 !~ '^[0-9a-f]{64}$'
     OR v_header_sha256 IS NULL
     OR v_header_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Prospecta import hash metadata'
      USING ERRCODE = '22023';
  END IF;

  IF v_contract_version IS DISTINCT FROM 'prospecta-import-v1' THEN
    RAISE EXCEPTION 'Unsupported Prospecta import contract'
      USING ERRCODE = '22023';
  END IF;

  IF v_workflow_version IS NULL
     OR length(v_workflow_version) NOT BETWEEN 1 AND 128
     OR v_ruleset_version IS NULL
     OR length(v_ruleset_version) NOT BETWEEN 1 AND 128
     OR v_prompt_model_version IS NULL
     OR length(v_prompt_model_version) NOT BETWEEN 1 AND 128
     OR v_execution_mode IS NULL
     OR length(v_execution_mode) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid Prospecta producer version metadata'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_rows) <> 'array'
     OR jsonb_array_length(v_rows) < 1 THEN
    RAISE EXCEPTION 'Prospecta import requires at least one accepted row'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_import_manifest) <> 'object'
     OR v_import_manifest->>'delimiter' IS DISTINCT FROM ';'
     OR lower(v_import_manifest->>'encoding') NOT IN ('utf8', 'utf-8')
     OR COALESCE(v_import_manifest->>'row_count', '') !~ '^[0-9]+$'
     OR (v_import_manifest->>'row_count')::integer
       IS DISTINCT FROM jsonb_array_length(v_rows) THEN
    RAISE EXCEPTION 'Invalid Prospecta import manifest'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*)::integer,
    count(DISTINCT row_value->>'source_row')::integer
  INTO v_row_count, v_distinct_source_rows
  FROM jsonb_array_elements(v_rows) AS row_value;

  IF v_distinct_source_rows <> v_row_count THEN
    RAISE EXCEPTION 'Duplicate source row in Prospecta import'
      USING ERRCODE = '22023';
  END IF;

  v_idempotency_key_hash :=
    public.lead_sha256_text(v_app_idempotency_key);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_submission_id, 0));

  SELECT *
  INTO v_existing
  FROM public.prospecta_import_acceptances
  WHERE submission_id = v_submission_id;

  IF FOUND THEN
    IF v_existing.uploaded_file_sha256 IS DISTINCT FROM v_file_sha256
       OR v_existing.idempotency_key_hash IS DISTINCT FROM v_idempotency_key_hash
       OR v_existing.contract_version IS DISTINCT FROM v_contract_version
       OR v_existing.accepted_row_count IS DISTINCT FROM v_row_count THEN
      RAISE EXCEPTION 'Conflicting Prospecta import acceptance replay'
        USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object(
      'accepted', true,
      'import_batch_id', v_existing.import_batch_id,
      'row_count', v_existing.accepted_row_count,
      'accepted_at', v_existing.accepted_at,
      'replayed', true
    );
  END IF;

  v_import_batch_id :=
    'ib_' || public.lead_sha256_text(
      v_file_sha256 || '|' ||
      v_workflow_version || '|' ||
      v_ruleset_version || '|' ||
      v_prompt_model_version || '|' ||
      v_execution_mode || '|'
    );

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_rows)
    ORDER BY (value->>'source_row')::integer
  LOOP
    IF jsonb_typeof(v_row) <> 'object'
       OR COALESCE(v_row->>'source_row', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Invalid accepted row identity'
        USING ERRCODE = '22023';
    END IF;

    v_source_row := (v_row->>'source_row')::integer;
    v_raw_row_sha256 := v_row->>'raw_row_sha256';
    v_normalized_row_sha256 := v_row->>'normalized_row_sha256';
    v_cnpj_normalizado := NULLIF(v_row->>'cnpj_normalizado', '');

    IF v_source_row < 2
       OR v_raw_row_sha256 IS NULL
       OR v_raw_row_sha256 !~ '^[0-9a-f]{64}$'
       OR v_normalized_row_sha256 IS NULL
       OR v_normalized_row_sha256 !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(v_row->'raw_row') <> 'object'
       OR jsonb_typeof(v_row->'normalized_payload') <> 'object' THEN
      RAISE EXCEPTION 'Invalid accepted row structure'
        USING ERRCODE = '22023';
    END IF;

    v_input_row_id :=
      'row_' || public.lead_sha256_text(
        v_import_batch_id || '|' ||
        v_source_row || '|' ||
        v_raw_row_sha256
      );
    v_idempotency_key :=
      'idem_' || public.lead_sha256_text(
        v_import_batch_id || '|' ||
        v_source_row || '|' ||
        COALESCE(v_cnpj_normalizado, 'sem_cnpj') || '|' ||
        v_raw_row_sha256 || '|' ||
        v_workflow_version || '|' ||
        v_ruleset_version || '|' ||
        v_prompt_model_version || '|' ||
        v_execution_mode || '|'
      );
    v_lead_run_id :=
      'lr_' || public.lead_sha256_text('lead_run|' || v_idempotency_key);
    v_decision_id :=
      'dec_' || public.lead_sha256_text('decision|' || v_idempotency_key);

    v_claim := public.lead_claim_processing_empresaaqui_import(
      COALESCE(v_row->'normalized_payload', '{}'::jsonb) ||
      jsonb_build_object(
        'import_batch_id', v_import_batch_id,
        'uploaded_file_sha256', v_file_sha256,
        'raw_rows_sha256', v_raw_rows_sha256,
        'header_sha256', v_header_sha256,
        'input_row_id', v_input_row_id,
        'raw_row_sha256', v_raw_row_sha256,
        'normalized_row_sha256', v_normalized_row_sha256,
        'idempotency_key', v_idempotency_key,
        'lead_run_id', v_lead_run_id,
        'decision_id', v_decision_id,
        'cnpj_normalizado', v_cnpj_normalizado,
        'source_row', v_source_row,
        'workflow_version', v_workflow_version,
        'ruleset_version', v_ruleset_version,
        'prompt_model_version', v_prompt_model_version,
        'execution_mode', v_execution_mode,
        'source', 'EmpresaAqui',
        'import_manifest', v_import_manifest,
        'raw_row', v_row->'raw_row',
        'normalized_payload', v_row->'normalized_payload',
        'idempotency_payload', jsonb_build_object(
          'contract_version', v_contract_version
        )
      ),
      'prospecta-import-v1:' || v_submission_id,
      false,
      interval '30 minutes'
    );

    v_claim_batch_id := v_claim->>'import_batch_id';
    IF v_claim_batch_id IS NULL
       OR v_claim_batch_id !~ '^ib_[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Producer claim returned invalid batch identity'
        USING ERRCODE = '23514';
    END IF;

    v_import_batch_id := v_claim_batch_id;
  END LOOP;

  SELECT count(*)::integer
  INTO v_durable_row_count
  FROM public.lead_input_rows AS accepted_row
  JOIN jsonb_array_elements(v_rows) AS expected_row
    ON accepted_row.source_row = (expected_row->>'source_row')::integer
   AND accepted_row.raw_row_sha256 = expected_row->>'raw_row_sha256'
  WHERE accepted_row.import_batch_id = v_import_batch_id;

  IF v_durable_row_count IS DISTINCT FROM v_row_count THEN
    RAISE EXCEPTION 'Durable accepted row set does not match the request'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.prospecta_import_acceptances (
    submission_id,
    import_batch_id,
    uploaded_file_sha256,
    idempotency_key_hash,
    contract_version,
    accepted_row_count
  )
  VALUES (
    v_submission_id,
    v_import_batch_id,
    v_file_sha256,
    v_idempotency_key_hash,
    v_contract_version,
    v_row_count
  )
  RETURNING accepted_at INTO v_accepted_at;

  RETURN jsonb_build_object(
    'accepted', true,
    'import_batch_id', v_import_batch_id,
    'row_count', v_row_count,
    'accepted_at', v_accepted_at,
    'replayed', false
  );
END;
$$;

COMMENT ON FUNCTION public.prospecta_accept_empresaqui_batch_v1(jsonb)
IS 'Atomically accepts one Prospecta EmpresaAqui submission, its producer rows, and the app correlation ledger.';

REVOKE ALL ON FUNCTION
  public.prospecta_accept_empresaqui_batch_v1(jsonb)
  FROM PUBLIC;

CREATE VIEW public.prospecta_import_acceptances_v1 AS
SELECT
  submission_id,
  import_batch_id,
  uploaded_file_sha256,
  accepted_row_count,
  accepted_at
FROM public.prospecta_import_acceptances;

REVOKE ALL ON public.prospecta_import_acceptances_v1 FROM PUBLIC;
