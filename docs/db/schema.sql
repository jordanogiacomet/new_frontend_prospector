--
-- PostgreSQL database dump
--

\restrict v6339MtSSanqoUZEn6AovMcWD4WzT9YeEkwyqUIhPBLsxOnFqAe36hbfXhsHsvf

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: lead_processing_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.lead_processing_status AS ENUM (
    'RECEIVED',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'RETRYABLE',
    'DEAD_LETTER',
    'SKIPPED'
);


--
-- Name: crm_find_company_matches(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crm_find_company_matches(p_cnpj text, p_website_domain text, p_account_name_normalized text, p_email text, p_phone_digits text) RETURNS TABLE(crm_match_type text, crm_match_strength integer, crm_company_key text, crm_cnpj character varying, crm_website_domain text, crm_account_name text, crm_latest_status text, crm_priority_status text, crm_lifecycle_stage text, crm_suppression_level text, crm_recommended_action text, crm_recommendation_reason text, crm_last_modified_at timestamp with time zone, crm_last_converted_at timestamp with time zone, crm_lead_count integer, crm_contact_count integer, crm_status_counts jsonb, crm_email_optout_any boolean, crm_phone_optout_any boolean, crm_try_again_any boolean)
    LANGUAGE sql STABLE
    AS $$
WITH raw_matches AS (
  SELECT 'cnpj'::text AS match_type, 100 AS strength, c.*
  FROM crm_company_history c
  WHERE COALESCE(p_cnpj, '') <> '' AND c.cnpj = p_cnpj

  UNION ALL
  SELECT 'email'::text AS match_type, 90 AS strength, c.*
  FROM crm_lead_contact_history l
  JOIN crm_company_history c ON c.company_key = l.company_key
  WHERE COALESCE(p_email, '') <> '' AND l.email = lower(p_email)

  UNION ALL
  SELECT 'domain'::text AS match_type, 80 AS strength, c.*
  FROM crm_company_history c
  WHERE COALESCE(p_website_domain, '') <> '' AND c.website_domain = lower(p_website_domain)

  UNION ALL
  SELECT 'phone'::text AS match_type, 70 AS strength, c.*
  FROM crm_lead_contact_history l
  JOIN crm_company_history c ON c.company_key = l.company_key
  WHERE COALESCE(p_phone_digits, '') <> '' AND l.phone_digits = p_phone_digits

  UNION ALL
  SELECT 'account_name'::text AS match_type, 55 AS strength, c.*
  FROM crm_company_history c
  WHERE COALESCE(p_account_name_normalized, '') <> ''
    AND c.account_name_normalized = lower(p_account_name_normalized)
), ranked AS (
  SELECT DISTINCT ON (company_key)
    match_type,
    strength,
    company_key,
    cnpj,
    website_domain,
    account_name,
    latest_status,
    priority_status,
    lifecycle_stage,
    suppression_level,
    recommended_action,
    recommendation_reason,
    last_modified_at,
    last_converted_at,
    lead_count,
    contact_count,
    status_counts_json,
    email_optout_any,
    phone_optout_any,
    try_again_any
  FROM raw_matches
  ORDER BY company_key, strength DESC, last_modified_at DESC NULLS LAST
)
SELECT
  match_type,
  strength,
  company_key,
  cnpj,
  website_domain,
  account_name,
  latest_status,
  priority_status,
  lifecycle_stage,
  suppression_level,
  recommended_action,
  recommendation_reason,
  last_modified_at,
  last_converted_at,
  lead_count,
  contact_count,
  status_counts_json,
  email_optout_any,
  phone_optout_any,
  try_again_any
FROM ranked
ORDER BY strength DESC, last_modified_at DESC NULLS LAST
LIMIT 5;
$$;


--
-- Name: lead_claim_processing(jsonb, text, boolean, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_claim_processing(p_input_payload jsonb, p_locked_by text DEFAULT NULL::text, p_force boolean DEFAULT false, p_lock_ttl interval DEFAULT '00:30:00'::interval) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_import_batch_id text := COALESCE(p_input_payload->>'import_batch_id', p_input_payload->>'importBatchId');
  v_uploaded_file_sha256 text := COALESCE(p_input_payload->>'uploaded_file_sha256', p_input_payload->>'uploadedFileSha256');
  v_raw_rows_sha256 text := COALESCE(p_input_payload->>'raw_rows_sha256', p_input_payload->>'rawRowsSha256');
  v_header_sha256 text := COALESCE(p_input_payload->>'header_sha256', p_input_payload->>'headerSha256');
  v_input_row_id text := COALESCE(p_input_payload->>'input_row_id', p_input_payload->>'inputRowId');
  v_raw_row_sha256 text := COALESCE(p_input_payload->>'raw_row_sha256', p_input_payload->>'rawRowSha256');
  v_normalized_row_sha256 text := COALESCE(p_input_payload->>'normalized_row_sha256', p_input_payload->>'normalizedRowSha256');
  v_idempotency_key text := COALESCE(p_input_payload->>'idempotency_key', p_input_payload->>'idempotencyKey');
  v_lead_run_id text := COALESCE(p_input_payload->>'lead_run_id', p_input_payload->>'leadRunId');
  v_decision_id text := COALESCE(p_input_payload->>'decision_id', p_input_payload->>'decisionId');
  v_cnpj text := COALESCE(p_input_payload->>'cnpj_normalizado', p_input_payload #>> '{company,cnpj}');
  v_source_row integer := COALESCE(NULLIF(COALESCE(p_input_payload->>'source_row', p_input_payload->>'sourceRow'), '')::integer, 0);
  v_workflow_version text := COALESCE(p_input_payload->>'workflow_version', p_input_payload->>'workflowVersion', p_input_payload->>'agentVersion', 'unknown_workflow');
  v_ruleset_version text := COALESCE(p_input_payload->>'ruleset_version', p_input_payload->>'rulesetVersion', 'unknown_rules');
  v_prompt_model_version text := COALESCE(p_input_payload->>'prompt_model_version', p_input_payload->>'promptModelVersion', 'unknown_prompts_models');
  v_execution_mode text := COALESCE(p_input_payload->>'execution_mode', p_input_payload->>'executionMode', 'PRODUCTION_E2E');
  v_force_reprocess_token text := NULLIF(COALESCE(p_input_payload->>'force_reprocess_token', p_input_payload->>'forceReprocessToken'), '');
  v_lock_owner text := COALESCE(NULLIF(p_locked_by, ''), 'n8n') || ':' || gen_random_uuid()::text;
  v_state public.lead_processing_state%ROWTYPE;
  v_claimed boolean := false;
  v_existing_decision_id text;
  v_existing_payload jsonb;
BEGIN
  IF v_uploaded_file_sha256 IS NULL THEN
    v_uploaded_file_sha256 := public.lead_sha256_jsonb(p_input_payload);
  END IF;
  IF v_raw_rows_sha256 IS NULL THEN
    v_raw_rows_sha256 := public.lead_sha256_jsonb(COALESCE(p_input_payload->'rawRows', p_input_payload));
  END IF;
  IF v_header_sha256 IS NULL THEN
    v_header_sha256 := public.lead_sha256_jsonb(COALESCE(p_input_payload->'raw_row', '{}'::jsonb));
  END IF;
  IF v_raw_row_sha256 IS NULL THEN
    v_raw_row_sha256 := public.lead_sha256_jsonb(COALESCE(p_input_payload->'raw_row', p_input_payload));
  END IF;
  IF v_normalized_row_sha256 IS NULL THEN
    v_normalized_row_sha256 := public.lead_sha256_jsonb(p_input_payload);
  END IF;
  IF v_import_batch_id IS NULL THEN
    v_import_batch_id := 'ib_' || public.lead_sha256_text(v_uploaded_file_sha256 || '|' || v_workflow_version || '|' || v_ruleset_version || '|' || v_prompt_model_version || '|' || v_execution_mode || '|' || coalesce(v_force_reprocess_token, ''));
  END IF;
  IF v_input_row_id IS NULL THEN
    v_input_row_id := 'row_' || public.lead_sha256_text(v_import_batch_id || '|' || v_source_row || '|' || v_raw_row_sha256);
  END IF;
  IF v_idempotency_key IS NULL THEN
    v_idempotency_key := 'idem_' || public.lead_sha256_text(v_import_batch_id || '|' || v_source_row || '|' || coalesce(v_cnpj, 'sem_cnpj') || '|' || v_raw_row_sha256 || '|' || v_workflow_version || '|' || v_ruleset_version || '|' || v_prompt_model_version || '|' || v_execution_mode || '|' || coalesce(v_force_reprocess_token, ''));
  END IF;
  IF v_lead_run_id IS NULL THEN
    v_lead_run_id := 'lr_' || public.lead_sha256_text('lead_run|' || v_idempotency_key);
  END IF;
  IF v_decision_id IS NULL THEN
    v_decision_id := 'dec_' || public.lead_sha256_text('decision|' || v_idempotency_key);
  END IF;

  INSERT INTO public.lead_import_batches (
    import_batch_id, source_system, uploaded_file_sha256, raw_rows_sha256, header_sha256,
    original_filename, file_size_bytes, file_mime_type, delimiter, encoding, row_count_expected,
    workflow_version, ruleset_version, prompt_model_version, execution_mode, force_reprocess_token,
    import_manifest, created_by
  )
  VALUES (
    v_import_batch_id,
    COALESCE(p_input_payload->>'source', 'EmpresaAqui'),
    v_uploaded_file_sha256,
    v_raw_rows_sha256,
    v_header_sha256,
    COALESCE(p_input_payload #>> '{import_manifest,original_filename}', p_input_payload #>> '{importManifest,original_filename}'),
    NULLIF(COALESCE(p_input_payload #>> '{import_manifest,file_size_bytes}', p_input_payload #>> '{importManifest,file_size_bytes}'), '')::bigint,
    COALESCE(p_input_payload #>> '{import_manifest,file_mime_type}', p_input_payload #>> '{importManifest,file_mime_type}'),
    COALESCE(p_input_payload #>> '{import_manifest,delimiter}', ';'),
    COALESCE(p_input_payload #>> '{import_manifest,encoding}', 'utf8'),
    COALESCE(NULLIF(COALESCE(p_input_payload #>> '{import_manifest,row_count}', p_input_payload #>> '{importManifest,row_count}'), '')::integer, NULL),
    v_workflow_version,
    v_ruleset_version,
    v_prompt_model_version,
    v_execution_mode,
    v_force_reprocess_token,
    COALESCE(p_input_payload->'import_manifest', p_input_payload->'importManifest', '{}'::jsonb),
    p_locked_by
  )
  ON CONFLICT (import_batch_id) DO UPDATE SET
    last_seen_at = now(),
    received_count = public.lead_import_batches.received_count + 1;

  INSERT INTO public.lead_input_rows (
    input_row_id, import_batch_id, source_system, source_row, raw_row_sha256, normalized_row_sha256,
    cnpj_normalizado, raw_row, normalized_payload, duplicate_count_in_batch, duplicate_index_in_batch
  )
  VALUES (
    v_input_row_id,
    v_import_batch_id,
    COALESCE(p_input_payload->>'source', 'EmpresaAqui'),
    v_source_row,
    v_raw_row_sha256,
    v_normalized_row_sha256,
    NULLIF(v_cnpj, ''),
    COALESCE(p_input_payload->'raw_row', p_input_payload->'rawRow', '{}'::jsonb),
    p_input_payload,
    COALESCE(NULLIF(COALESCE(p_input_payload->>'cnpjDuplicateCountInBatch', p_input_payload->>'cnpj_duplicate_count_in_batch'), '')::integer, 1),
    COALESCE(NULLIF(COALESCE(p_input_payload->>'cnpjDuplicateIndexInBatch', p_input_payload->>'cnpj_duplicate_index_in_batch'), '')::integer, 1)
  )
  ON CONFLICT (import_batch_id, source_row) DO UPDATE SET
    last_seen_at = now()
  WHERE public.lead_input_rows.raw_row_sha256 = EXCLUDED.raw_row_sha256;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source row conflict for import_batch_id=% source_row=% with different raw_row_sha256', v_import_batch_id, v_source_row
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.lead_processing_state (
    idempotency_key, lead_run_id, decision_id, input_row_id, import_batch_id, source_row, cnpj_normalizado,
    workflow_version, ruleset_version, prompt_model_version, execution_mode, force_reprocess_token,
    status, attempt_count, locked_by, locked_at, lock_expires_at, idempotency_payload
  )
  VALUES (
    v_idempotency_key, v_lead_run_id, v_decision_id, v_input_row_id, v_import_batch_id, v_source_row, NULLIF(v_cnpj, ''),
    v_workflow_version, v_ruleset_version, v_prompt_model_version, v_execution_mode, v_force_reprocess_token,
    'PROCESSING', 1, v_lock_owner, now(), now() + p_lock_ttl,
    COALESCE(p_input_payload->'idempotency_payload', p_input_payload->'idempotencyPayload', '{}'::jsonb)
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    last_seen_at = now(),
    updated_at = now(),
    status = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.status
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.status
      ELSE 'PROCESSING'::public.lead_processing_status
    END,
    attempt_count = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.attempt_count
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.attempt_count
      ELSE public.lead_processing_state.attempt_count + 1
    END,
    locked_by = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.locked_by
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.locked_by
      ELSE v_lock_owner
    END,
    locked_at = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.locked_at
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.locked_at
      ELSE now()
    END,
    lock_expires_at = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.lock_expires_at
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.lock_expires_at
      ELSE now() + p_lock_ttl
    END
  RETURNING * INTO v_state;

  SELECT decision_id, decision_payload
  INTO v_existing_decision_id, v_existing_payload
  FROM public.lead_decisions
  WHERE idempotency_key = v_idempotency_key
    AND decision_status = 'COMPLETED'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_decision_id IS NOT NULL THEN
    UPDATE public.lead_processing_state
    SET status = 'COMPLETED', final_decision_id = v_existing_decision_id, completed_at = COALESCE(completed_at, now()), updated_at = now()
    WHERE idempotency_key = v_idempotency_key;
  END IF;

  v_claimed := v_existing_decision_id IS NULL
    AND v_state.status = 'PROCESSING'::public.lead_processing_status
    AND v_state.locked_by = v_lock_owner;

  PERFORM public.lead_mark_stage_status(v_idempotency_key, 'input', 'RECEIVED', jsonb_build_object('input_row_id', v_input_row_id, 'import_batch_id', v_import_batch_id), NULL, 'lead_claim_processing', p_locked_by, false);

  IF v_claimed THEN
    PERFORM public.lead_mark_stage_status(v_idempotency_key, 'claim', 'PROCESSING', jsonb_build_object('lock_owner', v_lock_owner, 'lock_ttl_seconds', EXTRACT(EPOCH FROM p_lock_ttl)), NULL, 'lead_claim_processing', p_locked_by, false);
  END IF;

  RETURN jsonb_build_object(
    'schema', 'lead_claim_result_v1',
    'should_process', v_claimed,
    'skip', NOT v_claimed,
    'skip_reason', CASE
      WHEN v_existing_decision_id IS NOT NULL THEN 'COMPLETED_ALREADY'
      WHEN v_state.status = 'PROCESSING'::public.lead_processing_status THEN 'PROCESSING_IN_PROGRESS'
      ELSE 'NOT_CLAIMED'
    END,
    'import_batch_id', v_import_batch_id,
    'input_row_id', v_input_row_id,
    'lead_run_id', v_lead_run_id,
    'idempotency_key', v_idempotency_key,
    'decision_id', v_decision_id,
    'existing_decision_id', v_existing_decision_id,
    'existing_decision_payload', v_existing_payload,
    'status', (SELECT status::text FROM public.lead_processing_state WHERE idempotency_key = v_idempotency_key),
    'attempt_count', (SELECT attempt_count FROM public.lead_processing_state WHERE idempotency_key = v_idempotency_key),
    'lock_owner', CASE WHEN v_claimed THEN v_lock_owner ELSE v_state.locked_by END
  );
END;
$$;


--
-- Name: lead_claim_processing_empresaaqui_import(jsonb, text, boolean, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_claim_processing_empresaaqui_import(p_input_payload jsonb, p_locked_by text DEFAULT NULL::text, p_force boolean DEFAULT false, p_lock_ttl interval DEFAULT '00:30:00'::interval) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_import_batch_id text := COALESCE(p_input_payload->>'import_batch_id', p_input_payload->>'importBatchId');
  v_original_import_batch_id text := COALESCE(p_input_payload->>'import_batch_id', p_input_payload->>'importBatchId');
  v_uploaded_file_sha256 text := COALESCE(p_input_payload->>'uploaded_file_sha256', p_input_payload->>'uploadedFileSha256');
  v_raw_rows_sha256 text := COALESCE(p_input_payload->>'raw_rows_sha256', p_input_payload->>'rawRowsSha256');
  v_header_sha256 text := COALESCE(p_input_payload->>'header_sha256', p_input_payload->>'headerSha256');
  v_input_row_id text := COALESCE(p_input_payload->>'input_row_id', p_input_payload->>'inputRowId');
  v_original_input_row_id text := COALESCE(p_input_payload->>'input_row_id', p_input_payload->>'inputRowId');
  v_raw_row_sha256 text := COALESCE(p_input_payload->>'raw_row_sha256', p_input_payload->>'rawRowSha256');
  v_normalized_row_sha256 text := COALESCE(p_input_payload->>'normalized_row_sha256', p_input_payload->>'normalizedRowSha256');
  v_idempotency_key text := COALESCE(p_input_payload->>'idempotency_key', p_input_payload->>'idempotencyKey');
  v_lead_run_id text := COALESCE(p_input_payload->>'lead_run_id', p_input_payload->>'leadRunId');
  v_decision_id text := COALESCE(p_input_payload->>'decision_id', p_input_payload->>'decisionId');
  v_cnpj text := COALESCE(p_input_payload->>'cnpj_normalizado', p_input_payload #>> '{company,cnpj}');
  v_source_row integer := COALESCE(NULLIF(COALESCE(p_input_payload->>'source_row', p_input_payload->>'sourceRow'), '')::integer, 0);
  v_workflow_version text := COALESCE(p_input_payload->>'workflow_version', p_input_payload->>'workflowVersion', p_input_payload->>'agentVersion', 'unknown_workflow');
  v_ruleset_version text := COALESCE(p_input_payload->>'ruleset_version', p_input_payload->>'rulesetVersion', 'unknown_rules');
  v_prompt_model_version text := COALESCE(p_input_payload->>'prompt_model_version', p_input_payload->>'promptModelVersion', 'unknown_prompts_models');
  v_execution_mode text := COALESCE(p_input_payload->>'execution_mode', p_input_payload->>'executionMode', 'PRODUCTION_E2E');
  v_force_reprocess_token text := NULLIF(COALESCE(p_input_payload->>'force_reprocess_token', p_input_payload->>'forceReprocessToken'), '');
  v_source_system text := COALESCE(p_input_payload->>'source', p_input_payload #>> '{import_manifest,source_system}', p_input_payload #>> '{importManifest,source_system}', 'EmpresaAqui');
  v_delimiter text := COALESCE(p_input_payload #>> '{import_manifest,delimiter}', p_input_payload #>> '{importManifest,delimiter}', ';');
  v_encoding text := lower(COALESCE(p_input_payload #>> '{import_manifest,encoding}', p_input_payload #>> '{importManifest,encoding}', 'utf8'));
  v_lock_owner text := COALESCE(NULLIF(p_locked_by, ''), v_lead_run_id, v_idempotency_key, 'n8n');
  v_state public.lead_processing_state%ROWTYPE;
  v_existing_decision_id text;
  v_existing_payload jsonb;
  v_claimed boolean := false;
  v_import_batch_replayed boolean := false;
  v_input_row_replayed boolean := false;
BEGIN
  IF v_source_system <> 'EmpresaAqui' THEN
    RAISE EXCEPTION 'Invalid source_system for EmpresaAqui import workflow: %', v_source_system
      USING ERRCODE = '22023';
  END IF;

  IF v_delimiter <> ';' THEN
    RAISE EXCEPTION 'Invalid delimiter for EmpresaAqui import workflow: expected ; got %', v_delimiter
      USING ERRCODE = '22023';
  END IF;

  IF v_encoding NOT IN ('utf8', 'utf-8') THEN
    RAISE EXCEPTION 'Invalid encoding for EmpresaAqui import workflow: expected utf8 got %', v_encoding
      USING ERRCODE = '22023';
  END IF;

  IF v_import_batch_id IS NULL OR v_uploaded_file_sha256 IS NULL OR v_input_row_id IS NULL OR v_raw_row_sha256 IS NULL
     OR v_idempotency_key IS NULL OR v_lead_run_id IS NULL OR v_decision_id IS NULL THEN
    RAISE EXCEPTION 'Missing mandatory idempotency fields for EmpresaAqui import: batch=%, file_sha=%, input_row=%, raw_row_sha=%, idem=%, lead_run=%, decision=%',
      v_import_batch_id, v_uploaded_file_sha256, v_input_row_id, v_raw_row_sha256, v_idempotency_key, v_lead_run_id, v_decision_id
      USING ERRCODE = '22023';
  END IF;

  -- Upsert por chave NATURAL do batch, não só por PK.
  -- Esse é o ponto do hotfix: mesmo CSV + versões + modo = replay idempotente, não erro fatal.
  INSERT INTO public.lead_import_batches (
    import_batch_id,
    source_system,
    uploaded_file_sha256,
    raw_rows_sha256,
    header_sha256,
    original_filename,
    file_size_bytes,
    file_mime_type,
    delimiter,
    encoding,
    row_count_expected,
    workflow_version,
    ruleset_version,
    prompt_model_version,
    execution_mode,
    force_reprocess_token,
    import_manifest,
    created_by
  )
  VALUES (
    v_import_batch_id,
    'EmpresaAqui',
    v_uploaded_file_sha256,
    v_raw_rows_sha256,
    v_header_sha256,
    COALESCE(p_input_payload #>> '{import_manifest,original_filename}', p_input_payload #>> '{importManifest,original_filename}'),
    NULLIF(COALESCE(p_input_payload #>> '{import_manifest,file_size_bytes}', p_input_payload #>> '{importManifest,file_size_bytes}'), '')::bigint,
    COALESCE(p_input_payload #>> '{import_manifest,file_mime_type}', p_input_payload #>> '{importManifest,file_mime_type}'),
    v_delimiter,
    'utf8',
    COALESCE(NULLIF(COALESCE(p_input_payload #>> '{import_manifest,row_count}', p_input_payload #>> '{importManifest,row_count}'), '')::integer, NULL),
    v_workflow_version,
    v_ruleset_version,
    v_prompt_model_version,
    v_execution_mode,
    v_force_reprocess_token,
    COALESCE(p_input_payload->'import_manifest', p_input_payload->'importManifest', '{}'::jsonb),
    p_locked_by
  )
  ON CONFLICT (
    uploaded_file_sha256,
    workflow_version,
    ruleset_version,
    prompt_model_version,
    execution_mode,
    (coalesce(force_reprocess_token, ''))
  ) DO UPDATE SET
    last_seen_at = now(),
    received_count = public.lead_import_batches.received_count + 1,
    import_manifest = CASE
      WHEN public.lead_import_batches.import_manifest = '{}'::jsonb THEN EXCLUDED.import_manifest
      ELSE public.lead_import_batches.import_manifest
    END
  RETURNING import_batch_id INTO v_import_batch_id;

  v_import_batch_replayed := v_import_batch_id IS DISTINCT FROM v_original_import_batch_id;

  -- A linha deve usar o import_batch_id canônico retornado pelo banco.
  INSERT INTO public.lead_input_rows (
    input_row_id,
    import_batch_id,
    source_system,
    source_row,
    raw_row_sha256,
    normalized_row_sha256,
    cnpj_normalizado,
    raw_row,
    normalized_payload,
    duplicate_count_in_batch,
    duplicate_index_in_batch
  )
  VALUES (
    v_input_row_id,
    v_import_batch_id,
    'EmpresaAqui',
    v_source_row,
    v_raw_row_sha256,
    v_normalized_row_sha256,
    NULLIF(v_cnpj, ''),
    COALESCE(p_input_payload->'raw_row', p_input_payload->'rawRow', '{}'::jsonb),
    p_input_payload || jsonb_build_object('import_batch_id', v_import_batch_id, 'importBatchId', v_import_batch_id),
    COALESCE(NULLIF(COALESCE(p_input_payload->>'cnpjDuplicateCountInBatch', p_input_payload->>'cnpj_duplicate_count_in_batch'), '')::integer, 1),
    COALESCE(NULLIF(COALESCE(p_input_payload->>'cnpjDuplicateIndexInBatch', p_input_payload->>'cnpj_duplicate_index_in_batch'), '')::integer, 1)
  )
  ON CONFLICT (import_batch_id, source_row) DO UPDATE SET
    last_seen_at = now()
  WHERE public.lead_input_rows.raw_row_sha256 = EXCLUDED.raw_row_sha256
  RETURNING input_row_id INTO v_input_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source row conflict for EmpresaAqui import_batch_id=% source_row=%: existing row has different raw_row_sha256',
      v_import_batch_id, v_source_row
      USING ERRCODE = '23505';
  END IF;

  v_input_row_replayed := v_input_row_id IS DISTINCT FROM v_original_input_row_id;

  INSERT INTO public.lead_processing_state (
    idempotency_key,
    lead_run_id,
    decision_id,
    input_row_id,
    import_batch_id,
    source_row,
    cnpj_normalizado,
    workflow_version,
    ruleset_version,
    prompt_model_version,
    execution_mode,
    force_reprocess_token,
    status,
    attempt_count,
    locked_by,
    locked_at,
    lock_expires_at,
    idempotency_payload
  )
  VALUES (
    v_idempotency_key,
    v_lead_run_id,
    v_decision_id,
    v_input_row_id,
    v_import_batch_id,
    v_source_row,
    NULLIF(v_cnpj, ''),
    v_workflow_version,
    v_ruleset_version,
    v_prompt_model_version,
    v_execution_mode,
    v_force_reprocess_token,
    'PROCESSING',
    1,
    v_lock_owner,
    now(),
    now() + p_lock_ttl,
    COALESCE(p_input_payload->'idempotency_payload', p_input_payload->'idempotencyPayload', '{}'::jsonb)
      || jsonb_build_object('canonical_import_batch_id', v_import_batch_id, 'canonical_input_row_id', v_input_row_id)
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    last_seen_at = now(),
    updated_at = now(),
    input_row_id = COALESCE(public.lead_processing_state.input_row_id, EXCLUDED.input_row_id),
    import_batch_id = COALESCE(public.lead_processing_state.import_batch_id, EXCLUDED.import_batch_id),
    status = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.status
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.status
      ELSE 'PROCESSING'::public.lead_processing_status
    END,
    attempt_count = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.attempt_count
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.attempt_count
      ELSE public.lead_processing_state.attempt_count + 1
    END,
    locked_by = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.locked_by
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.locked_by
      ELSE v_lock_owner
    END,
    locked_at = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.locked_at
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.locked_at
      ELSE now()
    END,
    lock_expires_at = CASE
      WHEN public.lead_processing_state.status = 'COMPLETED'::public.lead_processing_status THEN public.lead_processing_state.lock_expires_at
      WHEN public.lead_processing_state.status = 'PROCESSING'::public.lead_processing_status
           AND public.lead_processing_state.lock_expires_at > now()
           AND NOT p_force THEN public.lead_processing_state.lock_expires_at
      ELSE now() + p_lock_ttl
    END
  RETURNING * INTO v_state;

  -- 1) Decisão exata pela idempotency_key nova.
  -- 2) Fallback de replay/canonicalização: decisão já salva para o mesmo batch canônico + linha + raw hash.
  SELECT d.decision_id, d.decision_payload
  INTO v_existing_decision_id, v_existing_payload
  FROM public.lead_decisions d
  WHERE d.decision_status = 'COMPLETED'
    AND (
      d.idempotency_key = v_idempotency_key
      OR (
        d.import_batch_id = v_import_batch_id
        AND d.source_row = v_source_row
        AND d.raw_row_sha256 = v_raw_row_sha256
      )
    )
  ORDER BY
    CASE WHEN d.idempotency_key = v_idempotency_key THEN 0 ELSE 1 END,
    d.created_at DESC,
    d.decision_id DESC
  LIMIT 1;

  IF v_existing_decision_id IS NOT NULL THEN
    UPDATE public.lead_processing_state
    SET status = 'COMPLETED'::public.lead_processing_status,
        final_decision_id = v_existing_decision_id,
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE idempotency_key = v_idempotency_key;
  END IF;

  v_claimed := v_existing_decision_id IS NULL
    AND v_state.status = 'PROCESSING'::public.lead_processing_status
    AND v_state.locked_by = v_lock_owner;

  PERFORM public.lead_mark_stage_status(
    v_idempotency_key,
    'input',
    'RECEIVED',
    jsonb_build_object(
      'input_row_id', v_input_row_id,
      'original_input_row_id', v_original_input_row_id,
      'import_batch_id', v_import_batch_id,
      'original_import_batch_id', v_original_import_batch_id,
      'import_batch_replayed', v_import_batch_replayed,
      'input_row_replayed', v_input_row_replayed,
      'source_system', 'EmpresaAqui'
    ),
    NULL,
    'lead_claim_processing_empresaaqui_import',
    p_locked_by,
    false
  );

  IF v_claimed THEN
    PERFORM public.lead_mark_stage_status(
      v_idempotency_key,
      'claim',
      'PROCESSING',
      jsonb_build_object('lock_owner', v_lock_owner, 'lock_ttl_seconds', EXTRACT(EPOCH FROM p_lock_ttl)),
      NULL,
      'lead_claim_processing_empresaaqui_import',
      p_locked_by,
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'schema', 'lead_claim_result_v2_empresaaqui_import',
    'source_system', 'EmpresaAqui',
    'should_process', v_claimed,
    'skip', NOT v_claimed,
    'skip_reason', CASE
      WHEN v_existing_decision_id IS NOT NULL THEN 'COMPLETED_ALREADY'
      WHEN v_state.status = 'PROCESSING'::public.lead_processing_status THEN 'PROCESSING_IN_PROGRESS'
      ELSE 'NOT_CLAIMED'
    END,
    'import_batch_id', v_import_batch_id,
    'canonical_import_batch_id', v_import_batch_id,
    'original_import_batch_id', v_original_import_batch_id,
    'import_batch_replayed', v_import_batch_replayed,
    'canonicalized_import_batch', v_import_batch_replayed,
    'input_row_id', v_input_row_id,
    'canonical_input_row_id', v_input_row_id,
    'original_input_row_id', v_original_input_row_id,
    'input_row_replayed', v_input_row_replayed,
    'lead_run_id', v_lead_run_id,
    'idempotency_key', v_idempotency_key,
    'decision_id', v_decision_id,
    'existing_decision_id', v_existing_decision_id,
    'existing_decision_payload', v_existing_payload,
    'status', (SELECT status::text FROM public.lead_processing_state WHERE idempotency_key = v_idempotency_key),
    'attempt_count', (SELECT attempt_count FROM public.lead_processing_state WHERE idempotency_key = v_idempotency_key),
    'lock_owner', CASE WHEN v_claimed THEN v_lock_owner ELSE v_state.locked_by END
  );
END;
$$;


--
-- Name: FUNCTION lead_claim_processing_empresaaqui_import(p_input_payload jsonb, p_locked_by text, p_force boolean, p_lock_ttl interval); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lead_claim_processing_empresaaqui_import(p_input_payload jsonb, p_locked_by text, p_force boolean, p_lock_ttl interval) IS 'EmpresaAqui v5.9.2: claim idempotente com upsert por chave natural de lead_import_batches, canonicalização de import_batch_id/input_row_id e replay seguro do mesmo CSV.';


--
-- Name: lead_json_bool(jsonb, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_json_bool(p_payload jsonb, p_key text, p_default boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v text;
BEGIN
  v := lower(coalesce(p_payload ->> p_key, ''));
  IF v IN ('true','t','1','yes','sim') THEN RETURN true; END IF;
  IF v IN ('false','f','0','no','nao','não') THEN RETURN false; END IF;
  RETURN p_default;
END;
$$;


--
-- Name: lead_json_int(jsonb, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_json_int(p_payload jsonb, p_key text, p_default integer DEFAULT 0) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
DECLARE
  v text;
BEGIN
  v := p_payload ->> p_key;
  IF v IS NULL OR v !~ '^-?[0-9]+$' THEN
    RETURN p_default;
  END IF;
  RETURN v::integer;
END;
$_$;


--
-- Name: lead_mark_stage_status(text, text, text, jsonb, jsonb, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_mark_stage_status(p_idempotency_key text, p_stage text, p_status text, p_payload jsonb DEFAULT '{}'::jsonb, p_error jsonb DEFAULT NULL::jsonb, p_source_node text DEFAULT NULL::text, p_n8n_execution_id text DEFAULT NULL::text, p_terminal boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_state public.lead_processing_state%ROWTYPE;
  v_status public.lead_processing_status;
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_payload_sha text;
  v_event_id text;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_state
  FROM public.lead_processing_state
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_processing_state not found for idempotency_key=%', p_idempotency_key
      USING ERRCODE = 'P0002';
  END IF;

  v_status := p_status::public.lead_processing_status;
  v_payload_sha := public.lead_sha256_jsonb(v_payload);
  v_event_id := public.lead_stage_event_id(p_idempotency_key, p_stage, p_status, GREATEST(v_state.attempt_count, 1), v_payload_sha);

  INSERT INTO public.lead_processing_events (
    stage_event_id,
    idempotency_key,
    lead_run_id,
    input_row_id,
    import_batch_id,
    decision_id,
    stage,
    status,
    attempt_no,
    payload_sha256,
    event_payload,
    error_payload,
    source_node,
    n8n_execution_id
  )
  VALUES (
    v_event_id,
    p_idempotency_key,
    v_state.lead_run_id,
    v_state.input_row_id,
    v_state.import_batch_id,
    v_state.decision_id,
    p_stage,
    v_status,
    GREATEST(v_state.attempt_count, 1),
    v_payload_sha,
    v_payload,
    p_error,
    p_source_node,
    p_n8n_execution_id
  )
  ON CONFLICT (stage_event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.lead_processing_state
  SET
    status = CASE
      WHEN p_terminal AND v_status = 'COMPLETED'::public.lead_processing_status THEN 'COMPLETED'::public.lead_processing_status
      WHEN v_status IN ('FAILED'::public.lead_processing_status, 'RETRYABLE'::public.lead_processing_status, 'DEAD_LETTER'::public.lead_processing_status) THEN v_status
      WHEN v_status = 'PROCESSING'::public.lead_processing_status THEN 'PROCESSING'::public.lead_processing_status
      ELSE status
    END,
    last_stage = p_stage,
    last_error = CASE WHEN p_error IS NOT NULL THEN p_error ELSE last_error END,
    updated_at = now(),
    last_seen_at = now(),
    completed_at = CASE WHEN p_terminal AND v_status = 'COMPLETED'::public.lead_processing_status THEN now() ELSE completed_at END,
    failed_at = CASE WHEN v_status IN ('FAILED'::public.lead_processing_status, 'DEAD_LETTER'::public.lead_processing_status) THEN now() ELSE failed_at END,
    next_retry_at = CASE WHEN v_status = 'RETRYABLE'::public.lead_processing_status THEN now() + interval '15 minutes' ELSE next_retry_at END
  WHERE idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'stage_event_id', v_event_id,
    'idempotency_key', p_idempotency_key,
    'stage', p_stage,
    'status', p_status,
    'attempt_no', GREATEST(v_state.attempt_count, 1),
    'inserted', v_inserted > 0,
    'terminal', p_terminal
  );
END;
$$;


--
-- Name: lead_save_decision(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_save_decision(p_input_payload jsonb, p_locked_by text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_idempotency_key text := COALESCE(p_input_payload->>'idempotency_key', p_input_payload->>'idempotencyKey');
  v_lead_run_id text := COALESCE(p_input_payload->>'lead_run_id', p_input_payload->>'leadRunId');
  v_decision_id text := COALESCE(p_input_payload->>'decision_id', p_input_payload->>'decisionId');
  v_input_row_id text := COALESCE(p_input_payload->>'input_row_id', p_input_payload->>'inputRowId');
  v_import_batch_id text := COALESCE(p_input_payload->>'import_batch_id', p_input_payload->>'importBatchId');
  v_uploaded_file_sha256 text := COALESCE(p_input_payload->>'uploaded_file_sha256', p_input_payload->>'uploadedFileSha256');
  v_raw_row_sha256 text := COALESCE(p_input_payload->>'raw_row_sha256', p_input_payload->>'rawRowSha256');
  v_normalized_row_sha256 text := COALESCE(p_input_payload->>'normalized_row_sha256', p_input_payload->>'normalizedRowSha256');
  v_source_hash_sha256 text := replace(COALESCE(p_input_payload->>'source_hash_sha256', p_input_payload->>'sourceHash', public.lead_sha256_jsonb(p_input_payload)), 'sha256:', '');
  v_cnpj text := COALESCE(p_input_payload->>'cnpj_normalizado', p_input_payload #>> '{company,cnpj}');
  v_source_row integer := COALESCE(NULLIF(COALESCE(p_input_payload->>'source_row', p_input_payload->>'sourceRow'), '')::integer, 0);
  v_workflow_version text := COALESCE(p_input_payload->>'workflow_version', p_input_payload->>'workflowVersion', p_input_payload->>'agentVersion', 'unknown_workflow');
  v_ruleset_version text := COALESCE(p_input_payload->>'ruleset_version', p_input_payload->>'rulesetVersion', 'unknown_rules');
  v_prompt_model_version text := COALESCE(p_input_payload->>'prompt_model_version', p_input_payload->>'promptModelVersion', 'unknown_prompts_models');
  v_strategic_version text := COALESCE(p_input_payload->>'strategicResearchVersion', p_input_payload->>'strategic_research_version');
  v_execution_mode text := COALESCE(p_input_payload->>'execution_mode', p_input_payload->>'executionMode', 'PRODUCTION_E2E');
  v_force_reprocess_token text := NULLIF(COALESCE(p_input_payload->>'force_reprocess_token', p_input_payload->>'forceReprocessToken'), '');
  v_rows integer := 0;
  v_event jsonb;
  v_expires_days integer := public.lead_json_int(p_input_payload, 'cacheExpiresDays', 90);
  v_existing_payload jsonb;
BEGIN
  IF v_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Cannot save decision without idempotency_key';
  END IF;
  IF v_decision_id IS NULL THEN
    v_decision_id := 'dec_' || public.lead_sha256_text('decision|' || v_idempotency_key);
  END IF;

  INSERT INTO public.lead_processing_state (
    idempotency_key, lead_run_id, decision_id, input_row_id, import_batch_id, source_row, cnpj_normalizado,
    workflow_version, ruleset_version, prompt_model_version, execution_mode, force_reprocess_token,
    status, attempt_count, locked_by, locked_at, lock_expires_at, idempotency_payload
  )
  VALUES (
    v_idempotency_key,
    COALESCE(v_lead_run_id, 'lr_' || public.lead_sha256_text('lead_run|' || v_idempotency_key)),
    v_decision_id,
    v_input_row_id,
    v_import_batch_id,
    v_source_row,
    NULLIF(v_cnpj, ''),
    v_workflow_version,
    v_ruleset_version,
    v_prompt_model_version,
    v_execution_mode,
    v_force_reprocess_token,
    'PROCESSING',
    1,
    p_locked_by,
    now(),
    now() + interval '30 minutes',
    COALESCE(p_input_payload->'idempotency_payload', p_input_payload->'idempotencyPayload', '{}'::jsonb)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  INSERT INTO public.lead_decisions (
    decision_id, idempotency_key, lead_run_id, input_row_id, import_batch_id, source_row, cnpj_normalizado,
    uploaded_file_sha256, raw_row_sha256, normalized_row_sha256, source_hash_sha256,
    workflow_version, ruleset_version, prompt_model_version, strategic_research_version, execution_mode, force_reprocess_token,
    final_score, final_verdict, trust_status, final_action, final_action_reason, priority, used_cache, research_status,
    model_versions, rule_versions, prompt_versions, cache_policy, idempotency_payload, input_snapshot,
    decision_payload, external_snapshots, report_json, llm_usage, expires_at
  )
  VALUES (
    v_decision_id,
    v_idempotency_key,
    COALESCE(v_lead_run_id, 'lr_' || public.lead_sha256_text('lead_run|' || v_idempotency_key)),
    v_input_row_id,
    v_import_batch_id,
    v_source_row,
    NULLIF(v_cnpj, ''),
    COALESCE(v_uploaded_file_sha256, public.lead_sha256_jsonb(p_input_payload)),
    COALESCE(v_raw_row_sha256, public.lead_sha256_jsonb(COALESCE(p_input_payload->'raw_row', p_input_payload))),
    COALESCE(v_normalized_row_sha256, public.lead_sha256_jsonb(p_input_payload)),
    v_source_hash_sha256,
    v_workflow_version,
    v_ruleset_version,
    v_prompt_model_version,
    v_strategic_version,
    v_execution_mode,
    v_force_reprocess_token,
    public.lead_json_int(p_input_payload, 'finalScore', public.lead_json_int(p_input_payload, 'preTrustScore', 0)),
    COALESCE(p_input_payload->>'finalVerdict', CASE WHEN p_input_payload->>'preTrustStatus' = 'BLOQUEAR' THEN 'NAO_ABORDAR' ELSE 'REVISAO_HUMANA' END),
    COALESCE(p_input_payload->>'trustStatus', p_input_payload #>> '{agentValidation,trustStatus}'),
    COALESCE(p_input_payload->>'finalAction', p_input_payload #>> '{agentValidation,proximaAcao}', CASE WHEN p_input_payload->>'preTrustStatus' = 'BLOQUEAR' THEN 'NAO_ABORDAR' ELSE 'REVISAO_HUMANA' END),
    COALESCE(p_input_payload->>'finalActionReason', p_input_payload #>> '{agentValidation,resumo}'),
    COALESCE(p_input_payload->>'priority', 'R'),
    public.lead_json_bool(p_input_payload, 'usedCache', false),
    COALESCE(p_input_payload->>'strategicResearchStatus', p_input_payload #>> '{strategicResearchMeta,status}', 'NOT_RUN'),
    jsonb_build_object(
      'workflow_version', v_workflow_version,
      'qualification_model', p_input_payload #>> '{qualificationOpenAIUsage,model}',
      'discovery_model', p_input_payload #>> '{discoveryOpenAIUsage,model}'
    ),
    jsonb_build_object('ruleset_version', v_ruleset_version),
    jsonb_build_object('prompt_model_version', v_prompt_model_version, 'strategic_research_version', v_strategic_version),
    jsonb_build_object('cache_expires_days', v_expires_days, 'used_cache', public.lead_json_bool(p_input_payload, 'usedCache', false)),
    COALESCE(p_input_payload->'idempotency_payload', p_input_payload->'idempotencyPayload', '{}'::jsonb),
    jsonb_build_object(
      'raw_row_sha256', v_raw_row_sha256,
      'normalized_row_sha256', v_normalized_row_sha256,
      'agent_input', COALESCE(p_input_payload->'agentInput', '{}'::jsonb),
      'raw_row', COALESCE(p_input_payload->'raw_row', p_input_payload->'rawRow', '{}'::jsonb)
    ),
    p_input_payload,
    jsonb_build_object(
      'crmAudit', COALESCE(p_input_payload->'crmAudit', '{}'::jsonb),
      'searchEvidence', COALESCE(p_input_payload->'searchEvidence', '[]'::jsonb),
      'strategicSearchEvidence', COALESCE(p_input_payload->'strategicSearchEvidence', '[]'::jsonb),
      'n8nReportOutput', COALESCE(p_input_payload->'n8nReportOutput', '{}'::jsonb)
    ),
    COALESCE(p_input_payload->'strategicResearchReport', '{}'::jsonb),
    COALESCE(p_input_payload->'openaiUsageSummary', p_input_payload->'openaiUsage', '{}'::jsonb),
    now() + (GREATEST(v_expires_days, 1) * interval '1 day')
  )
  ON CONFLICT (decision_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT decision_payload INTO v_existing_payload
  FROM public.lead_decisions
  WHERE decision_id = v_decision_id;

  v_event := public.lead_mark_stage_status(
    v_idempotency_key,
    'final_decision',
    'COMPLETED',
    jsonb_build_object('decision_id', v_decision_id, 'inserted_decision', v_rows > 0),
    NULL,
    'lead_save_decision',
    p_locked_by,
    true
  );

  UPDATE public.lead_processing_state
  SET final_decision_id = v_decision_id, completed_at = COALESCE(completed_at, now()), updated_at = now(), lock_expires_at = now()
  WHERE idempotency_key = v_idempotency_key;

  RETURN jsonb_build_object(
    'schema', 'lead_save_decision_result_v1',
    'decision_id', v_decision_id,
    'idempotency_key', v_idempotency_key,
    'inserted_decision', v_rows > 0,
    'already_existed', v_rows = 0,
    'stage_event', v_event,
    'decision_payload', v_existing_payload
  );
END;
$$;


--
-- Name: lead_save_decision_strict(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_save_decision_strict(p_payload jsonb, p_lock_owner text DEFAULT 'n8n'::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_raw jsonb;
  v_company_validation_id text;
  v_run_log_id text;
  v_strategic_report_id text;
  v_strategic_required boolean;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'PERSISTENCE_CONTRACT_VIOLATION: payload JSON inválido ou ausente'
      USING ERRCODE = 'P0001';
  END IF;

  v_raw := public.lead_save_decision(p_payload, p_lock_owner);

  IF v_raw IS NULL OR jsonb_typeof(v_raw) <> 'object' THEN
    RAISE EXCEPTION 'PERSISTENCE_CONTRACT_VIOLATION: lead_save_decision retornou vazio ou não-objeto'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'lead_run_id', p_payload->>'lead_run_id',
              'idempotency_key', p_payload->>'idempotency_key'
            )::text;
  END IF;

  v_company_validation_id := COALESCE(
    v_raw->>'company_validation_id',
    v_raw#>>'{saved_ids,company_validation_id}',
    v_raw#>>'{savedIds,company_validation_id}',
    v_raw#>>'{ids,company_validation_id}',
    v_raw#>>'{company_validation,id}',
    v_raw->>'lead_decision_id',
    v_raw->>'decision_id',
    v_raw->>'validation_id'
  );

  v_run_log_id := COALESCE(
    v_raw->>'run_log_id',
    v_raw#>>'{saved_ids,run_log_id}',
    v_raw#>>'{savedIds,run_log_id}',
    v_raw#>>'{ids,run_log_id}',
    v_raw#>>'{run_log,id}',
    v_raw->>'company_validation_run_id',
    v_raw->>'validation_run_id',
    v_raw->>'run_id'
  );

  v_strategic_report_id := COALESCE(
    v_raw->>'strategic_report_id',
    v_raw#>>'{saved_ids,strategic_report_id}',
    v_raw#>>'{savedIds,strategic_report_id}',
    v_raw#>>'{ids,strategic_report_id}',
    v_raw#>>'{strategic_report,id}',
    v_raw->>'strategic_research_report_id',
    v_raw->>'report_id'
  );

  v_strategic_required :=
    lower(coalesce(p_payload->>'strategicResearchCompleted', p_payload->>'strategic_research_completed', 'false')) IN ('true','1','yes','sim')
    OR coalesce(p_payload->>'reportOutputType', '') = 'NEW_LEAD_DEEP_DISCOVERY_REPORT'
    OR (p_payload ? 'strategicResearchReport' AND jsonb_typeof(p_payload->'strategicResearchReport') = 'object');

  IF v_company_validation_id IS NULL OR btrim(v_company_validation_id) = '' THEN
    v_missing := array_append(v_missing, 'company_validation_id');
  END IF;

  IF v_run_log_id IS NULL OR btrim(v_run_log_id) = '' THEN
    v_missing := array_append(v_missing, 'run_log_id');
  END IF;

  IF v_strategic_required AND (v_strategic_report_id IS NULL OR btrim(v_strategic_report_id) = '') THEN
    v_missing := array_append(v_missing, 'strategic_report_id');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PERSISTENCE_CONTRACT_VIOLATION: retorno sem IDs obrigatórios: %', array_to_string(v_missing, ', ')
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'missing', v_missing,
              'lead_run_id', COALESCE(p_payload->>'lead_run_id', p_payload->>'leadRunId'),
              'idempotency_key', COALESCE(p_payload->>'idempotency_key', p_payload->>'idempotencyKey'),
              'strategic_required', v_strategic_required,
              'raw_result', v_raw
            )::text;
  END IF;

  RETURN jsonb_build_object(
    'status', 'PERSISTED',
    'persisted', true,
    'persisted_at', now(),
    'company_validation_id', v_company_validation_id,
    'run_log_id', v_run_log_id,
    'strategic_report_id', v_strategic_report_id,
    'strategic_report_required', v_strategic_required,
    'saved_ids', jsonb_build_object(
      'company_validation_id', v_company_validation_id,
      'run_log_id', v_run_log_id,
      'strategic_report_id', v_strategic_report_id
    ),
    'raw_result', v_raw
  );
END;
$$;


--
-- Name: FUNCTION lead_save_decision_strict(p_payload jsonb, p_lock_owner text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.lead_save_decision_strict(p_payload jsonb, p_lock_owner text) IS 'Chama lead_save_decision e falha a transação se os IDs obrigatórios de persistência não forem retornados.';


--
-- Name: lead_sha256_jsonb(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_sha256_jsonb(p_value jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT encode(digest(COALESCE(p_value, '{}'::jsonb)::text, 'sha256'), 'hex');
$$;


--
-- Name: lead_sha256_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_sha256_text(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT encode(digest(COALESCE(p_value, ''), 'sha256'), 'hex');
$$;


--
-- Name: lead_stage_event_id(text, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lead_stage_event_id(p_idempotency_key text, p_stage text, p_status text, p_attempt_no integer, p_payload_sha256 text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT 'evt_' || public.lead_sha256_text(
    jsonb_build_object(
      'schema', 'stage_event_v1',
      'idempotency_key', p_idempotency_key,
      'stage', p_stage,
      'status', p_status,
      'attempt_no', p_attempt_no,
      'payload_sha256', p_payload_sha256
    )::text
  );
$$;


--
-- Name: llm_cost_usd(text, integer, integer, integer, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.llm_cost_usd(p_model text, p_input_tokens integer, p_output_tokens integer, p_cached_input_tokens integer DEFAULT 0, p_at timestamp with time zone DEFAULT now(), p_pricing_mode text DEFAULT 'standard'::text) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
  SELECT ROUND(
    (
      GREATEST(COALESCE(p_input_tokens, 0) - LEAST(COALESCE(p_cached_input_tokens, 0), COALESCE(p_input_tokens, 0)), 0)::numeric * mp.input_price_per_1m
      + LEAST(COALESCE(p_cached_input_tokens, 0), COALESCE(p_input_tokens, 0))::numeric * COALESCE(mp.cached_input_price_per_1m, mp.input_price_per_1m)
      + COALESCE(p_output_tokens, 0)::numeric * mp.output_price_per_1m
    ) / 1000000.0,
    8
  )
  FROM public.model_pricing mp
  WHERE NULLIF(p_model, '') IS NOT NULL
    AND mp.pricing_mode = COALESCE(NULLIF(p_pricing_mode, ''), 'standard')
    AND mp.valid_from <= COALESCE(p_at, now())
    AND (mp.valid_to IS NULL OR mp.valid_to > COALESCE(p_at, now()))
    AND (mp.model = p_model OR p_model LIKE mp.model || '-%')
  ORDER BY
    CASE WHEN mp.model = p_model THEN 0 ELSE 1 END,
    length(mp.model) DESC,
    mp.valid_from DESC
  LIMIT 1;
$$;


--
-- Name: FUNCTION llm_cost_usd(p_model text, p_input_tokens integer, p_output_tokens integer, p_cached_input_tokens integer, p_at timestamp with time zone, p_pricing_mode text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.llm_cost_usd(p_model text, p_input_tokens integer, p_output_tokens integer, p_cached_input_tokens integer, p_at timestamp with time zone, p_pricing_mode text) IS 'Calcula custo USD por modelo usando model_pricing efetivo na data. Retorna NULL se o modelo não tiver preço cadastrado.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_eval_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_eval_cases (
    id bigint NOT NULL,
    case_name text NOT NULL,
    case_family text NOT NULL,
    enabled boolean DEFAULT true,
    input_csv_row jsonb NOT NULL,
    mocked_crm_result jsonb,
    mocked_cache_result jsonb,
    mocked_search_result jsonb,
    mocked_llm_output jsonb,
    expected_pre_trust_status text,
    expected_final_verdict text,
    expected_final_action text,
    expected_priority text,
    expected_risk_flags jsonb,
    expected_cache_used boolean,
    expected_skip_expensive_validation boolean,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_eval_cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_eval_cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_eval_cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_eval_cases_id_seq OWNED BY public.agent_eval_cases.id;


--
-- Name: agent_eval_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_eval_results (
    id bigint NOT NULL,
    eval_run_id text NOT NULL,
    case_id bigint,
    agent_version text NOT NULL,
    judge_version text,
    n8n_execution_id text,
    actual_result jsonb NOT NULL,
    expected_result jsonb,
    judge_result jsonb,
    passed boolean NOT NULL,
    failure_category text,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_eval_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.agent_eval_results_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: agent_eval_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.agent_eval_results_id_seq OWNED BY public.agent_eval_results.id;


--
-- Name: lead_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_decisions (
    decision_id text NOT NULL,
    idempotency_key text NOT NULL,
    lead_run_id text NOT NULL,
    input_row_id text NOT NULL,
    import_batch_id text NOT NULL,
    source_row integer NOT NULL,
    cnpj_normalizado text,
    uploaded_file_sha256 text NOT NULL,
    raw_row_sha256 text NOT NULL,
    normalized_row_sha256 text NOT NULL,
    source_hash_sha256 text NOT NULL,
    workflow_version text NOT NULL,
    ruleset_version text NOT NULL,
    prompt_model_version text NOT NULL,
    strategic_research_version text,
    execution_mode text NOT NULL,
    force_reprocess_token text,
    decision_status text DEFAULT 'COMPLETED'::text NOT NULL,
    final_score integer,
    final_verdict text,
    trust_status text,
    final_action text,
    final_action_reason text,
    priority text,
    used_cache boolean DEFAULT false NOT NULL,
    research_status text,
    model_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    rule_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    prompt_versions jsonb DEFAULT '{}'::jsonb NOT NULL,
    cache_policy jsonb DEFAULT '{}'::jsonb NOT NULL,
    idempotency_payload jsonb NOT NULL,
    input_snapshot jsonb NOT NULL,
    decision_payload jsonb NOT NULL,
    external_snapshots jsonb DEFAULT '{}'::jsonb NOT NULL,
    report_json jsonb,
    llm_usage jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    superseded_at timestamp with time zone,
    superseded_by_decision_id text,
    superseded_reason text,
    CONSTRAINT lead_decisions_decision_id_check CHECK ((decision_id ~ '^dec_[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_decisions_decision_status_check CHECK ((decision_status = ANY (ARRAY['COMPLETED'::text, 'SUPERSEDED_MANUALLY'::text]))),
    CONSTRAINT lead_decisions_final_score_check CHECK (((final_score IS NULL) OR ((final_score >= 0) AND (final_score <= 100)))),
    CONSTRAINT lead_decisions_normalized_row_sha256_check CHECK ((normalized_row_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_decisions_raw_row_sha256_check CHECK ((raw_row_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_decisions_source_hash_sha256_check CHECK ((source_hash_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_decisions_uploaded_file_sha256_check CHECK ((uploaded_file_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: company_latest_validation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_latest_validation AS
 SELECT DISTINCT ON (cnpj_normalizado) decision_id AS id,
    decision_id,
    idempotency_key,
    lead_run_id,
    import_batch_id,
    input_row_id,
    source_row,
    cnpj_normalizado AS cnpj,
    cnpj_normalizado,
    (decision_payload #>> '{company,razaoSocial}'::text[]) AS razao_social,
    (decision_payload #>> '{company,nomeFantasia}'::text[]) AS nome_fantasia,
    (decision_payload #>> '{company,cidade}'::text[]) AS cidade,
    (decision_payload #>> '{company,uf}'::text[]) AS uf,
    (decision_payload #>> '{company,cnaePrincipal}'::text[]) AS cnae_principal,
    (decision_payload #>> '{company,textoCnaePrincipal}'::text[]) AS cnae_descricao,
    (decision_payload #>> '{fiscal,porteEmpresa}'::text[]) AS porte_empresa,
    (decision_payload #>> '{fiscal,regimeTributarioAtual}'::text[]) AS regime_tributario,
    (decision_payload #>> '{commercial,faturamentoEstimado}'::text[]) AS faturamento_estimado,
    (decision_payload #>> '{commercial,quadroFuncionarios}'::text[]) AS quadro_funcionarios,
    public.lead_json_int((decision_payload #> '{company}'::text[]), 'quantidadeFiliais'::text, 0) AS quantidade_filiais,
    ('sha256:'::text || source_hash_sha256) AS source_hash,
    workflow_version AS agent_version,
    final_score AS trust_score,
    final_verdict AS trust_verdict,
    trust_status,
    (decision_payload #>> '{agentValidation,resumo}'::text[]) AS agent_summary,
    COALESCE((decision_payload #> '{agentValidation,sinaisPositivos}'::text[]), '[]'::jsonb) AS positive_signals,
    COALESCE((decision_payload #> '{risk,riskFlags}'::text[]), (decision_payload #> '{agentValidation,riscosEncontrados}'::text[]), '[]'::jsonb) AS risk_flags,
    COALESCE((decision_payload #> '{agentValidation,evidencias}'::text[]), (decision_payload #> '{searchEvidence}'::text[]), '[]'::jsonb) AS evidences,
    COALESCE((decision_payload #> '{searchQueries}'::text[]), '[]'::jsonb) AS search_queries,
    decision_payload AS raw_payload,
    public.lead_json_int(decision_payload, 'icpScore'::text, 0) AS icp_score,
    priority,
    (decision_payload ->> 'patrimonialPotential'::text) AS patrimonial_potential,
    (decision_payload ->> 'inventoryPotential'::text) AS inventory_potential,
    (decision_payload ->> 'valuationPotential'::text) AS valuation_potential,
    (decision_payload ->> 'ifrsPotential'::text) AS ifrs_potential,
    COALESCE((decision_payload #> '{apolloFitReason}'::text[]), '[]'::jsonb) AS apollo_fit_reason,
    public.lead_json_int(decision_payload, 'strategicAssetScore'::text, 0) AS strategic_asset_score,
    (decision_payload ->> 'strategicTier'::text) AS strategic_tier,
    COALESCE((decision_payload #> '{strategicReason}'::text[]), '[]'::jsonb) AS strategic_reason,
    public.lead_json_bool(decision_payload, 'crmMatchFound'::text, false) AS crm_match_found,
    (decision_payload #>> '{crmHistory,matchType}'::text[]) AS crm_match_type,
    public.lead_json_int((decision_payload #> '{crmHistory}'::text[]), 'matchStrength'::text, 0) AS crm_match_strength,
    (decision_payload #>> '{crmHistory,companyKey}'::text[]) AS crm_company_key,
    (decision_payload #>> '{crmHistory,lifecycleStage}'::text[]) AS crm_lifecycle_stage,
    (decision_payload #>> '{crmHistory,suppressionLevel}'::text[]) AS crm_suppression_level,
    COALESCE((decision_payload ->> 'crmRecommendedFinalAction'::text), (decision_payload #>> '{crmHistory,recommendedAction}'::text[])) AS crm_recommended_action,
    (decision_payload #>> '{crmHistory,latestStatus}'::text[]) AS crm_last_status,
    COALESCE((decision_payload #> '{crmHistory}'::text[]), '{}'::jsonb) AS crm_history,
    used_cache,
    created_at AS validated_at,
    expires_at,
    created_at,
    decision_status
   FROM public.lead_decisions ld
  WHERE ((decision_status = 'COMPLETED'::text) AND (cnpj_normalizado IS NOT NULL))
  ORDER BY cnpj_normalizado, created_at DESC, decision_id DESC;


--
-- Name: company_strategic_research_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_strategic_research_reports (
    id bigint NOT NULL,
    company_validation_id bigint,
    import_batch_id text,
    test_case_id text,
    source_row integer,
    cnpj text NOT NULL,
    razao_social text,
    report_version text DEFAULT 'strategic_report_v1'::text NOT NULL,
    research_status text DEFAULT 'COMPLETED'::text NOT NULL,
    strategic_fit_score integer DEFAULT 0 NOT NULL,
    strategic_priority text,
    confidence_level text,
    report_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    report_markdown text,
    evidences jsonb DEFAULT '[]'::jsonb NOT NULL,
    search_queries jsonb DEFAULT '[]'::jsonb NOT NULL,
    opportunity_triggers jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '180 days'::interval) NOT NULL,
    lead_run_id text,
    strategic_research_run_key text,
    integrity_status text DEFAULT 'OK'::text NOT NULL,
    integrity_error jsonb,
    CONSTRAINT company_strategic_research_reports_strategic_fit_score_check CHECK (((strategic_fit_score >= 0) AND (strategic_fit_score <= 100)))
);


--
-- Name: company_strategic_research_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_strategic_research_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_strategic_research_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_strategic_research_reports_id_seq OWNED BY public.company_strategic_research_reports.id;


--
-- Name: company_validation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_validation_runs (
    id bigint NOT NULL,
    import_batch_id text,
    source_row integer,
    cnpj text,
    razao_social text,
    pre_trust_status text,
    crm_suppression_level text,
    crm_recommended_action text,
    final_action text,
    processing_result text,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    test_case_id text,
    sector_detected text,
    llm_usage jsonb DEFAULT '{}'::jsonb NOT NULL,
    llm_input_tokens integer DEFAULT 0 NOT NULL,
    llm_output_tokens integer DEFAULT 0 NOT NULL,
    llm_total_tokens integer DEFAULT 0 NOT NULL,
    llm_estimated_cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    qualification_model text,
    qualification_input_tokens integer DEFAULT 0 NOT NULL,
    qualification_output_tokens integer DEFAULT 0 NOT NULL,
    qualification_total_tokens integer DEFAULT 0 NOT NULL,
    qualification_estimated_cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    discovery_model text,
    discovery_input_tokens integer DEFAULT 0 NOT NULL,
    discovery_output_tokens integer DEFAULT 0 NOT NULL,
    discovery_total_tokens integer DEFAULT 0 NOT NULL,
    discovery_estimated_cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    run_created_at timestamp with time zone DEFAULT now() NOT NULL,
    lead_run_id text,
    idempotency_key text,
    cnpj_normalizado text,
    strategic_research_run_key text,
    strategic_query_index integer,
    child_task_id text,
    integrity_status text DEFAULT 'OK'::text NOT NULL,
    integrity_error jsonb,
    stage_event_id text
);


--
-- Name: company_validation_runs_costed; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_validation_runs_costed AS
 WITH base AS (
         SELECT r.id,
            r.import_batch_id,
            r.source_row,
            r.cnpj,
            r.razao_social,
            r.pre_trust_status,
            r.crm_suppression_level,
            r.crm_recommended_action,
            r.final_action,
            r.processing_result,
            r.reason,
            r.created_at,
            r.test_case_id,
            r.sector_detected,
            r.llm_usage,
            r.llm_input_tokens,
            r.llm_output_tokens,
            r.llm_total_tokens,
            r.llm_estimated_cost_usd,
            r.qualification_model,
            r.qualification_input_tokens,
            r.qualification_output_tokens,
            r.qualification_total_tokens,
            r.qualification_estimated_cost_usd,
            r.discovery_model,
            r.discovery_input_tokens,
            r.discovery_output_tokens,
            r.discovery_total_tokens,
            r.discovery_estimated_cost_usd,
            r.run_created_at,
                CASE
                    WHEN ((r.llm_usage #>> '{by_stage,qualification,cached_input_tokens}'::text[]) ~ '^[0-9]+$'::text) THEN ((r.llm_usage #>> '{by_stage,qualification,cached_input_tokens}'::text[]))::integer
                    ELSE 0
                END AS qualification_cached_input_tokens_extracted,
                CASE
                    WHEN ((r.llm_usage #>> '{by_stage,discovery,cached_input_tokens}'::text[]) ~ '^[0-9]+$'::text) THEN ((r.llm_usage #>> '{by_stage,discovery,cached_input_tokens}'::text[]))::integer
                    ELSE 0
                END AS discovery_cached_input_tokens_extracted,
            COALESCE(NULLIF((r.llm_usage #>> '{pricing_mode}'::text[]), ''::text), 'standard'::text) AS pricing_mode_extracted,
            COALESCE(NULLIF((r.llm_usage #>> '{usage_source}'::text[]), ''::text), NULLIF((r.llm_usage #>> '{usage_accuracy_note}'::text[]), ''::text), 'unknown'::text) AS usage_source_extracted
           FROM public.company_validation_runs r
        ), costed AS (
         SELECT b.id,
            b.import_batch_id,
            b.source_row,
            b.cnpj,
            b.razao_social,
            b.pre_trust_status,
            b.crm_suppression_level,
            b.crm_recommended_action,
            b.final_action,
            b.processing_result,
            b.reason,
            b.created_at,
            b.test_case_id,
            b.sector_detected,
            b.llm_usage,
            b.llm_input_tokens,
            b.llm_output_tokens,
            b.llm_total_tokens,
            b.llm_estimated_cost_usd,
            b.qualification_model,
            b.qualification_input_tokens,
            b.qualification_output_tokens,
            b.qualification_total_tokens,
            b.qualification_estimated_cost_usd,
            b.discovery_model,
            b.discovery_input_tokens,
            b.discovery_output_tokens,
            b.discovery_total_tokens,
            b.discovery_estimated_cost_usd,
            b.run_created_at,
            b.qualification_cached_input_tokens_extracted,
            b.discovery_cached_input_tokens_extracted,
            b.pricing_mode_extracted,
            b.usage_source_extracted,
            public.llm_cost_usd(b.qualification_model, b.qualification_input_tokens, b.qualification_output_tokens, b.qualification_cached_input_tokens_extracted, b.run_created_at, b.pricing_mode_extracted) AS qualification_cost_usd_calculated,
            public.llm_cost_usd(b.discovery_model, b.discovery_input_tokens, b.discovery_output_tokens, b.discovery_cached_input_tokens_extracted, b.run_created_at, b.pricing_mode_extracted) AS discovery_cost_usd_calculated
           FROM base b
        )
 SELECT id,
    import_batch_id,
    source_row,
    cnpj,
    razao_social,
    pre_trust_status,
    crm_suppression_level,
    crm_recommended_action,
    final_action,
    processing_result,
    reason,
    created_at,
    test_case_id,
    sector_detected,
    llm_usage,
    llm_input_tokens,
    llm_output_tokens,
    llm_total_tokens,
    llm_estimated_cost_usd,
    qualification_model,
    qualification_input_tokens,
    qualification_output_tokens,
    qualification_total_tokens,
    qualification_estimated_cost_usd,
    discovery_model,
    discovery_input_tokens,
    discovery_output_tokens,
    discovery_total_tokens,
    discovery_estimated_cost_usd,
    run_created_at,
    qualification_cached_input_tokens_extracted,
    discovery_cached_input_tokens_extracted,
    pricing_mode_extracted,
    usage_source_extracted,
    qualification_cost_usd_calculated,
    discovery_cost_usd_calculated,
    round((COALESCE(qualification_cost_usd_calculated, (0)::numeric) + COALESCE(discovery_cost_usd_calculated, (0)::numeric)), 8) AS llm_cost_usd_calculated,
        CASE
            WHEN (COALESCE(llm_total_tokens, 0) > 0) THEN round((((COALESCE(qualification_cost_usd_calculated, (0)::numeric) + COALESCE(discovery_cost_usd_calculated, (0)::numeric)) / (llm_total_tokens)::numeric) * 1000.0), 8)
            ELSE NULL::numeric
        END AS cost_per_1k_tokens_usd_calculated
   FROM costed c;


--
-- Name: company_validation_cost_by_batch; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_validation_cost_by_batch AS
 SELECT import_batch_id,
    count(*) AS run_rows,
    count(DISTINCT NULLIF(cnpj, ''::text)) AS companies_seen,
    count(DISTINCT NULLIF(cnpj, ''::text)) FILTER (WHERE (COALESCE(llm_total_tokens, 0) > 0)) AS companies_with_reported_llm_tokens,
    count(DISTINCT NULLIF(cnpj, ''::text)) FILTER (WHERE (final_action = ANY (ARRAY['PROSPECTAR_AGORA'::text, 'PROSPECTAR'::text, 'PROSPECTAR_COM_CAUTELA'::text, 'ROTEAR_PARA_COMERCIAL'::text, 'ROTEAR_PARA_CONTA_EXISTENTE'::text, 'REENGAJAR_COM_HISTORICO'::text, 'RETOMAR_COM_HISTORICO'::text]))) AS approved_leads,
    sum(COALESCE(llm_input_tokens, 0)) AS input_tokens,
    sum(COALESCE(llm_output_tokens, 0)) AS output_tokens,
    sum(COALESCE(llm_total_tokens, 0)) AS total_tokens,
    round(sum(COALESCE(llm_cost_usd_calculated, (0)::numeric)), 8) AS llm_cost_usd,
    round((sum(COALESCE(llm_cost_usd_calculated, (0)::numeric)) / (NULLIF(count(DISTINCT NULLIF(cnpj, ''::text)) FILTER (WHERE (final_action = ANY (ARRAY['PROSPECTAR_AGORA'::text, 'PROSPECTAR'::text, 'PROSPECTAR_COM_CAUTELA'::text, 'ROTEAR_PARA_COMERCIAL'::text, 'ROTEAR_PARA_CONTA_EXISTENTE'::text, 'REENGAJAR_COM_HISTORICO'::text, 'RETOMAR_COM_HISTORICO'::text]))), 0))::numeric), 8) AS cost_per_approved_lead_usd
   FROM public.company_validation_runs_costed
  GROUP BY import_batch_id;


--
-- Name: company_validation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_validation_runs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_validation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_validation_runs_id_seq OWNED BY public.company_validation_runs.id;


--
-- Name: lead_processing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_processing_events (
    stage_event_id text NOT NULL,
    idempotency_key text NOT NULL,
    lead_run_id text NOT NULL,
    input_row_id text,
    import_batch_id text,
    decision_id text,
    stage text NOT NULL,
    status public.lead_processing_status NOT NULL,
    attempt_no integer DEFAULT 1 NOT NULL,
    payload_sha256 text NOT NULL,
    event_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_payload jsonb,
    source_node text,
    n8n_execution_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_processing_events_attempt_no_check CHECK ((attempt_no >= 1)),
    CONSTRAINT lead_processing_events_payload_sha256_check CHECK ((payload_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_processing_events_stage_event_id_check CHECK ((stage_event_id ~ '^evt_[0-9a-f]{64}$'::text))
);


--
-- Name: lead_processing_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_processing_state (
    idempotency_key text NOT NULL,
    lead_run_id text NOT NULL,
    decision_id text NOT NULL,
    input_row_id text,
    import_batch_id text,
    source_row integer,
    cnpj_normalizado text,
    workflow_version text NOT NULL,
    ruleset_version text NOT NULL,
    prompt_model_version text NOT NULL,
    execution_mode text NOT NULL,
    force_reprocess_token text,
    status public.lead_processing_status DEFAULT 'RECEIVED'::public.lead_processing_status NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    locked_by text,
    locked_at timestamp with time zone,
    lock_expires_at timestamp with time zone,
    last_stage text,
    last_error jsonb,
    idempotency_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    final_decision_id text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    CONSTRAINT lead_processing_state_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT lead_processing_state_decision_id_check CHECK ((decision_id ~ '^dec_[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_processing_state_idempotency_key_check CHECK ((idempotency_key ~ '^idem_[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_processing_state_lead_run_id_check CHECK ((lead_run_id ~ '^lr_[0-9a-f]{64}$'::text))
);


--
-- Name: company_validation_runs_idempotent; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.company_validation_runs_idempotent AS
 SELECT e.stage_event_id AS id,
    e.stage_event_id,
    e.import_batch_id,
    COALESCE((d.decision_payload ->> 'testCaseId'::text), (d.decision_payload ->> 'test_case_id'::text)) AS test_case_id,
    s.source_row,
    s.cnpj_normalizado AS cnpj,
    (d.decision_payload #>> '{company,razaoSocial}'::text[]) AS razao_social,
    (d.decision_payload ->> 'preTrustStatus'::text) AS pre_trust_status,
    (d.decision_payload #>> '{crmHistory,suppressionLevel}'::text[]) AS crm_suppression_level,
    COALESCE((d.decision_payload ->> 'crmRecommendedFinalAction'::text), (d.decision_payload #>> '{crmHistory,recommendedAction}'::text[])) AS crm_recommended_action,
    d.final_action,
    e.stage AS processing_stage,
    (e.status)::text AS processing_result,
    COALESCE((e.error_payload ->> 'message'::text), d.final_action_reason, (e.event_payload ->> 'reason'::text)) AS reason,
    d.llm_usage,
    public.lead_json_int((d.llm_usage #> '{totals}'::text[]), 'input_tokens'::text, 0) AS llm_input_tokens,
    public.lead_json_int((d.llm_usage #> '{totals}'::text[]), 'output_tokens'::text, 0) AS llm_output_tokens,
    public.lead_json_int((d.llm_usage #> '{totals}'::text[]), 'total_tokens'::text, 0) AS llm_total_tokens,
    NULL::numeric AS llm_estimated_cost_usd,
    e.lead_run_id,
    e.idempotency_key,
    s.cnpj_normalizado,
    (d.decision_payload ->> 'strategicResearchRunKey'::text) AS strategic_research_run_key,
    'OK'::text AS integrity_status,
    e.error_payload AS integrity_error,
    e.created_at
   FROM ((public.lead_processing_events e
     JOIN public.lead_processing_state s ON ((s.idempotency_key = e.idempotency_key)))
     LEFT JOIN public.lead_decisions d ON ((d.decision_id = s.final_decision_id)));


--
-- Name: company_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_validations (
    id bigint NOT NULL,
    cnpj character varying(14) NOT NULL,
    razao_social text,
    nome_fantasia text,
    cidade text,
    uf character(2),
    cnae_principal text,
    cnae_descricao text,
    porte_empresa text,
    regime_tributario text,
    faturamento_estimado text,
    quadro_funcionarios text,
    quantidade_filiais integer DEFAULT 0 NOT NULL,
    source_hash text,
    trust_score integer DEFAULT 0 NOT NULL,
    trust_verdict text DEFAULT 'REVISAO_HUMANA'::text NOT NULL,
    trust_status text DEFAULT 'Revisão Humana'::text NOT NULL,
    agent_summary text,
    positive_signals jsonb DEFAULT '[]'::jsonb NOT NULL,
    risk_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidences jsonb DEFAULT '[]'::jsonb NOT NULL,
    search_queries jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    validated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    agent_version text DEFAULT 'v1'::text NOT NULL,
    icp_score integer DEFAULT 0 NOT NULL,
    priority text DEFAULT 'E'::text NOT NULL,
    patrimonial_potential text DEFAULT 'BAIXO'::text NOT NULL,
    inventory_potential text DEFAULT 'BAIXO'::text NOT NULL,
    valuation_potential text DEFAULT 'BAIXO'::text NOT NULL,
    ifrs_potential text DEFAULT 'BAIXO'::text NOT NULL,
    apollo_fit_reason jsonb DEFAULT '[]'::jsonb NOT NULL,
    strategic_asset_score integer DEFAULT 0 NOT NULL,
    strategic_tier text DEFAULT 'E'::text NOT NULL,
    strategic_reason jsonb DEFAULT '[]'::jsonb NOT NULL,
    used_cache boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    crm_match_found boolean DEFAULT false,
    crm_match_type text,
    crm_match_strength integer,
    crm_company_key text,
    crm_lifecycle_stage text,
    crm_suppression_level text,
    crm_recommended_action text,
    crm_last_status text,
    crm_last_modified_at timestamp with time zone,
    crm_lead_count integer,
    crm_history jsonb DEFAULT '{}'::jsonb,
    cnpj_normalizado text,
    last_lead_run_id text,
    last_idempotency_key text,
    last_import_batch_id text,
    last_source_row integer,
    integrity_status text DEFAULT 'OK'::text NOT NULL,
    integrity_error jsonb,
    CONSTRAINT company_validations_icp_score_check CHECK (((icp_score >= 0) AND (icp_score <= 100))),
    CONSTRAINT company_validations_strategic_asset_score_check CHECK (((strategic_asset_score >= 0) AND (strategic_asset_score <= 100))),
    CONSTRAINT company_validations_trust_score_check CHECK (((trust_score >= 0) AND (trust_score <= 100)))
);


--
-- Name: company_validations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_validations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_validations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_validations_id_seq OWNED BY public.company_validations.id;


--
-- Name: crm_company_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_company_history (
    company_key text NOT NULL,
    match_key_type text,
    cnpj character varying(14),
    website_domain text,
    email_domains text,
    account_name text,
    account_name_normalized text,
    fantasia text,
    cidade text,
    estado text,
    lead_count integer,
    contact_count integer,
    status_counts_json jsonb,
    any_statuses text,
    latest_status text,
    priority_status text,
    lifecycle_stage text,
    suppression_level text,
    recommended_action text,
    recommendation_reason text,
    first_created_at timestamp with time zone,
    last_modified_at timestamp with time zone,
    last_converted_at timestamp with time zone,
    converted_count integer,
    lqm_count integer,
    lqv_count integer,
    visitado_count integer,
    video_reuniao_count integer,
    desqualificado_count integer,
    excluido_count integer,
    rj_falencia_count integer,
    email_optout_any boolean,
    email_invalid_any boolean,
    phone_optout_any boolean,
    phone_invalid_any boolean,
    try_again_any boolean,
    origins text,
    industries text,
    portes text,
    tributacoes text,
    solutions text,
    auditorias text,
    erps text,
    concorrentes text,
    latest_lead_id text,
    latest_contact_name text,
    latest_contact_email text,
    latest_contact_phone text,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_lead_contact_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crm_lead_contact_history (
    lead_id text NOT NULL,
    company_key text,
    cnpj character varying(14),
    website text,
    website_domain text,
    account_name text,
    account_name_normalized text,
    fantasia text,
    contact_name text,
    first_name text,
    last_name text,
    cargo text,
    email text,
    email_domain text,
    phone_digits text,
    phone_original text,
    status text,
    origem text,
    ramo_atividade text,
    cidade text,
    estado text,
    cep text,
    created_at timestamp with time zone,
    modified_at timestamp with time zone,
    converted_at timestamp with time zone,
    created_by text,
    modified_by text,
    email_optout boolean,
    email_invalid boolean,
    phone_optout boolean,
    phone_invalid boolean,
    do_not_call boolean,
    try_again boolean,
    concorrente text,
    erp text,
    porte text,
    tributacao text,
    solucoes text,
    atividade text,
    auditoria text,
    loaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: lead_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_import_batches (
    import_batch_id text NOT NULL,
    source_system text DEFAULT 'EmpresaAqui'::text NOT NULL,
    uploaded_file_sha256 text NOT NULL,
    raw_rows_sha256 text,
    header_sha256 text,
    original_filename text,
    file_size_bytes bigint,
    file_mime_type text,
    delimiter text DEFAULT ';'::text NOT NULL,
    encoding text DEFAULT 'utf8'::text NOT NULL,
    row_count_expected integer,
    workflow_version text NOT NULL,
    ruleset_version text NOT NULL,
    prompt_model_version text NOT NULL,
    execution_mode text NOT NULL,
    force_reprocess_token text,
    import_manifest jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    received_count integer DEFAULT 1 NOT NULL,
    created_by text,
    immutable_guard_sha256 text GENERATED ALWAYS AS (public.lead_sha256_text(((((((((((uploaded_file_sha256 || '|'::text) || workflow_version) || '|'::text) || ruleset_version) || '|'::text) || prompt_model_version) || '|'::text) || execution_mode) || '|'::text) || COALESCE(force_reprocess_token, ''::text)))) STORED,
    CONSTRAINT lead_import_batches_header_sha256_check CHECK (((header_sha256 IS NULL) OR (header_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT lead_import_batches_import_batch_id_check CHECK ((import_batch_id ~ '^ib_[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_import_batches_raw_rows_sha256_check CHECK (((raw_rows_sha256 IS NULL) OR (raw_rows_sha256 ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT lead_import_batches_received_count_check CHECK ((received_count >= 1)),
    CONSTRAINT lead_import_batches_row_count_expected_check CHECK (((row_count_expected IS NULL) OR (row_count_expected >= 0))),
    CONSTRAINT lead_import_batches_uploaded_file_sha256_check CHECK ((uploaded_file_sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: lead_input_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_input_rows (
    input_row_id text NOT NULL,
    import_batch_id text NOT NULL,
    source_system text DEFAULT 'EmpresaAqui'::text NOT NULL,
    source_row integer NOT NULL,
    raw_row_sha256 text NOT NULL,
    normalized_row_sha256 text NOT NULL,
    cnpj_normalizado text,
    raw_row jsonb NOT NULL,
    normalized_payload jsonb NOT NULL,
    duplicate_count_in_batch integer DEFAULT 1 NOT NULL,
    duplicate_index_in_batch integer DEFAULT 1 NOT NULL,
    row_status public.lead_processing_status DEFAULT 'RECEIVED'::public.lead_processing_status NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lead_input_rows_input_row_id_check CHECK ((input_row_id ~ '^row_[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_input_rows_normalized_row_sha256_check CHECK ((normalized_row_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_input_rows_raw_row_sha256_check CHECK ((raw_row_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT lead_input_rows_source_row_check CHECK ((source_row >= 1))
);


--
-- Name: model_pricing; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_pricing (
    model text NOT NULL,
    pricing_mode text DEFAULT 'standard'::text NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    input_price_per_1m numeric(18,6) NOT NULL,
    cached_input_price_per_1m numeric(18,6),
    output_price_per_1m numeric(18,6) NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_to timestamp with time zone,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT model_pricing_check CHECK (((valid_to IS NULL) OR (valid_to > valid_from)))
);


--
-- Name: TABLE model_pricing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.model_pricing IS 'Tabela efetiva de preços por modelo. Atualize esta tabela quando a OpenAI alterar preço; o workflow não deve ter preço hardcoded.';


--
-- Name: COLUMN model_pricing.input_price_per_1m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.input_price_per_1m IS 'USD por 1 milhão de tokens de input não-cacheado.';


--
-- Name: COLUMN model_pricing.cached_input_price_per_1m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.cached_input_price_per_1m IS 'USD por 1 milhão de tokens de input cacheado; se nulo, usa input_price_per_1m.';


--
-- Name: COLUMN model_pricing.output_price_per_1m; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.model_pricing.output_price_per_1m IS 'USD por 1 milhão de tokens de output.';


--
-- Name: vw_company_validation_batch_flow; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_company_validation_batch_flow AS
 SELECT import_batch_id,
    count(*) FILTER (WHERE (processing_result = 'RECEBIDO'::text)) AS recebidos,
    count(*) FILTER (WHERE (processing_result = 'BLOQUEADO_PRE_VALIDACAO'::text)) AS bloqueados_pre_validacao,
    count(*) FILTER (WHERE (processing_result = 'CRM_DECIDIU'::text)) AS crm_decidiu_evento,
    count(*) FILTER (WHERE (processing_result = 'CRM_DECIDIU_E_SALVO'::text)) AS crm_decidiu_e_salvo,
    count(*) FILTER (WHERE (processing_result = 'USOU_CACHE'::text)) AS usaram_cache,
    count(*) FILTER (WHERE (processing_result = 'INSERIDO_VALIDATION'::text)) AS inseridos_validation,
    count(*) FILTER (WHERE (processing_result = ANY (ARRAY['BLOQUEADO_PRE_VALIDACAO'::text, 'CRM_DECIDIU_E_SALVO'::text, 'USOU_CACHE'::text, 'INSERIDO_VALIDATION'::text]))) AS com_destino_final,
    (count(*) FILTER (WHERE (processing_result = 'RECEBIDO'::text)) - count(DISTINCT source_row) FILTER (WHERE (processing_result = ANY (ARRAY['BLOQUEADO_PRE_VALIDACAO'::text, 'CRM_DECIDIU_E_SALVO'::text, 'USOU_CACHE'::text, 'INSERIDO_VALIDATION'::text])))) AS possivelmente_sem_destino,
    min(created_at) AS inicio_em,
    max(created_at) AS fim_em
   FROM public.company_validation_runs
  GROUP BY import_batch_id;


--
-- Name: vw_company_validation_batch_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_company_validation_batch_summary AS
 SELECT import_batch_id,
    count(*) FILTER (WHERE (processing_result = 'RECEBIDO'::text)) AS recebidos,
    count(*) FILTER (WHERE (processing_result = 'BLOQUEADO_PRE_VALIDACAO'::text)) AS bloqueados_pre_validacao,
    count(*) FILTER (WHERE (processing_result = 'USOU_CACHE'::text)) AS usaram_cache,
    count(*) FILTER (WHERE (processing_result = 'CRM_DECIDIU'::text)) AS crm_decidiu,
    count(*) FILTER (WHERE (processing_result = 'CRM_DECIDIU_E_SALVO'::text)) AS crm_decidiu_e_salvo,
    count(*) FILTER (WHERE (processing_result = 'INSERIDO_VALIDATION'::text)) AS inseridos_validation,
    count(*) AS total_logs,
    min(created_at) AS inicio_em,
    max(created_at) AS fim_em
   FROM public.company_validation_runs
  GROUP BY import_batch_id;


--
-- Name: vw_company_validation_run_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_company_validation_run_summary AS
 SELECT import_batch_id,
    processing_result,
    count(*) AS quantidade,
    min(created_at) AS primeiro_log_em,
    max(created_at) AS ultimo_log_em
   FROM public.company_validation_runs
  GROUP BY import_batch_id, processing_result;


--
-- Name: vw_company_validation_runs_latest_per_company; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_company_validation_runs_latest_per_company AS
 WITH ranked AS (
         SELECT r.id,
            r.import_batch_id,
            r.source_row,
            r.cnpj,
            r.razao_social,
            r.pre_trust_status,
            r.crm_suppression_level,
            r.crm_recommended_action,
            r.final_action,
            r.processing_result,
            r.reason,
            r.created_at,
            row_number() OVER (PARTITION BY r.import_batch_id, r.source_row ORDER BY
                CASE r.processing_result
                    WHEN 'CRM_DECIDIU_E_SALVO'::text THEN 1
                    WHEN 'INSERIDO_VALIDATION'::text THEN 2
                    WHEN 'BLOQUEADO_PRE_VALIDACAO'::text THEN 3
                    WHEN 'USOU_CACHE'::text THEN 4
                    WHEN 'CRM_DECIDIU'::text THEN 5
                    WHEN 'RECEBIDO'::text THEN 99
                    ELSE 50
                END, r.created_at DESC, r.id DESC) AS rn
           FROM public.company_validation_runs r
        )
 SELECT id,
    import_batch_id,
    source_row,
    cnpj,
    razao_social,
    pre_trust_status,
    crm_suppression_level,
    crm_recommended_action,
    final_action,
    processing_result,
    reason,
    created_at
   FROM ranked
  WHERE (rn = 1);


--
-- Name: vw_company_validation_runs_missing_destination; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_company_validation_runs_missing_destination AS
 WITH received AS (
         SELECT DISTINCT company_validation_runs.import_batch_id,
            company_validation_runs.source_row,
            company_validation_runs.cnpj,
            company_validation_runs.razao_social
           FROM public.company_validation_runs
          WHERE (company_validation_runs.processing_result = 'RECEBIDO'::text)
        ), destination AS (
         SELECT DISTINCT company_validation_runs.import_batch_id,
            company_validation_runs.source_row
           FROM public.company_validation_runs
          WHERE (company_validation_runs.processing_result = ANY (ARRAY['BLOQUEADO_PRE_VALIDACAO'::text, 'CRM_DECIDIU_E_SALVO'::text, 'INSERIDO_VALIDATION'::text, 'USOU_CACHE'::text]))
        )
 SELECT r.import_batch_id,
    r.source_row,
    r.cnpj,
    r.razao_social
   FROM (received r
     LEFT JOIN destination d ON (((d.import_batch_id = r.import_batch_id) AND (d.source_row = r.source_row))))
  WHERE (d.source_row IS NULL);


--
-- Name: vw_dashboard_empresaqui; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_dashboard_empresaqui AS
 WITH latest_run AS (
         SELECT DISTINCT ON (company_validation_runs.cnpj) company_validation_runs.cnpj,
            company_validation_runs.import_batch_id,
            company_validation_runs.source_row,
            company_validation_runs.pre_trust_status,
            company_validation_runs.crm_suppression_level,
            company_validation_runs.crm_recommended_action,
            company_validation_runs.final_action,
            company_validation_runs.processing_result,
            company_validation_runs.reason,
            company_validation_runs.id AS run_id
           FROM public.company_validation_runs
          WHERE (company_validation_runs.cnpj IS NOT NULL)
          ORDER BY company_validation_runs.cnpj, company_validation_runs.id DESC
        )
 SELECT v.id,
    v.cnpj,
    v.razao_social,
    v.nome_fantasia,
    v.cidade,
    v.uf,
    v.cnae_principal,
    v.cnae_descricao,
    v.porte_empresa,
    v.regime_tributario,
    v.faturamento_estimado,
    v.quadro_funcionarios,
    v.quantidade_filiais,
    v.trust_score,
    v.trust_verdict,
    v.trust_status,
    v.icp_score,
    v.priority,
    v.strategic_asset_score,
    v.strategic_tier,
    v.patrimonial_potential,
    v.inventory_potential,
    v.valuation_potential,
    v.ifrs_potential,
    v.crm_match_found,
    v.crm_match_type,
    v.crm_match_strength,
    v.crm_company_key,
    v.crm_lifecycle_stage,
    v.crm_suppression_level AS validation_crm_suppression_level,
    v.crm_recommended_action AS validation_crm_recommended_action,
    v.crm_last_status,
    v.crm_lead_count,
    r.import_batch_id,
    r.pre_trust_status,
    r.crm_suppression_level AS run_crm_suppression_level,
    r.crm_recommended_action AS run_crm_recommended_action,
    r.final_action,
    r.processing_result AS last_processing_result,
    r.reason AS last_reason,
    v.used_cache,
    v.validated_at,
    v.expires_at,
    v.agent_version
   FROM (public.company_validations v
     LEFT JOIN latest_run r ON ((r.cnpj = (v.cnpj)::text)));


--
-- Name: workflow_dead_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_dead_letters (
    id bigint NOT NULL,
    lead_run_id text,
    stage text NOT NULL,
    error_code text NOT NULL,
    error_message text NOT NULL,
    payload_minimo jsonb DEFAULT '{}'::jsonb NOT NULL,
    retryable boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE workflow_dead_letters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.workflow_dead_letters IS 'DLQ para falhas de persistência/processamento antes de liberar output comercial no n8n.';


--
-- Name: COLUMN workflow_dead_letters.payload_minimo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workflow_dead_letters.payload_minimo IS 'Payload mínimo de auditoria/retry; evitar copiar payload integral, prompts ou dados sensíveis desnecessários.';


--
-- Name: workflow_dead_letters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_dead_letters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_dead_letters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_dead_letters_id_seq OWNED BY public.workflow_dead_letters.id;


--
-- Name: workflow_integrity_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workflow_integrity_errors (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    workflow_name text,
    execution_id text,
    node_name text,
    stage text,
    status text DEFAULT 'ERROR_REVIEW'::text NOT NULL,
    error_code text NOT NULL,
    message text NOT NULL,
    import_batch_id text,
    source_row integer,
    lead_run_id text,
    idempotency_key text,
    cnpj_normalizado text,
    strategic_research_run_key text,
    strategic_query_index integer,
    child_task_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: workflow_integrity_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workflow_integrity_errors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workflow_integrity_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workflow_integrity_errors_id_seq OWNED BY public.workflow_integrity_errors.id;


--
-- Name: agent_eval_cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_cases ALTER COLUMN id SET DEFAULT nextval('public.agent_eval_cases_id_seq'::regclass);


--
-- Name: agent_eval_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_results ALTER COLUMN id SET DEFAULT nextval('public.agent_eval_results_id_seq'::regclass);


--
-- Name: company_strategic_research_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_strategic_research_reports ALTER COLUMN id SET DEFAULT nextval('public.company_strategic_research_reports_id_seq'::regclass);


--
-- Name: company_validation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_validation_runs ALTER COLUMN id SET DEFAULT nextval('public.company_validation_runs_id_seq'::regclass);


--
-- Name: company_validations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_validations ALTER COLUMN id SET DEFAULT nextval('public.company_validations_id_seq'::regclass);


--
-- Name: workflow_dead_letters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_dead_letters ALTER COLUMN id SET DEFAULT nextval('public.workflow_dead_letters_id_seq'::regclass);


--
-- Name: workflow_integrity_errors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_integrity_errors ALTER COLUMN id SET DEFAULT nextval('public.workflow_integrity_errors_id_seq'::regclass);


--
-- Name: agent_eval_cases agent_eval_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_cases
    ADD CONSTRAINT agent_eval_cases_pkey PRIMARY KEY (id);


--
-- Name: agent_eval_results agent_eval_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_results
    ADD CONSTRAINT agent_eval_results_pkey PRIMARY KEY (id);


--
-- Name: company_strategic_research_reports company_strategic_research_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_strategic_research_reports
    ADD CONSTRAINT company_strategic_research_reports_pkey PRIMARY KEY (id);


--
-- Name: company_validation_runs company_validation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_validation_runs
    ADD CONSTRAINT company_validation_runs_pkey PRIMARY KEY (id);


--
-- Name: company_validations company_validations_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_validations
    ADD CONSTRAINT company_validations_cnpj_key UNIQUE (cnpj);


--
-- Name: company_validations company_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_validations
    ADD CONSTRAINT company_validations_pkey PRIMARY KEY (id);


--
-- Name: crm_company_history crm_company_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_company_history
    ADD CONSTRAINT crm_company_history_pkey PRIMARY KEY (company_key);


--
-- Name: crm_lead_contact_history crm_lead_contact_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_contact_history
    ADD CONSTRAINT crm_lead_contact_history_pkey PRIMARY KEY (lead_id);


--
-- Name: lead_decisions lead_decisions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_decisions
    ADD CONSTRAINT lead_decisions_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: lead_decisions lead_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_decisions
    ADD CONSTRAINT lead_decisions_pkey PRIMARY KEY (decision_id);


--
-- Name: lead_import_batches lead_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_import_batches
    ADD CONSTRAINT lead_import_batches_pkey PRIMARY KEY (import_batch_id);


--
-- Name: lead_input_rows lead_input_rows_one_row_position_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_input_rows
    ADD CONSTRAINT lead_input_rows_one_row_position_uq UNIQUE (import_batch_id, source_row);


--
-- Name: lead_input_rows lead_input_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_input_rows
    ADD CONSTRAINT lead_input_rows_pkey PRIMARY KEY (input_row_id);


--
-- Name: lead_input_rows lead_input_rows_same_raw_once_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_input_rows
    ADD CONSTRAINT lead_input_rows_same_raw_once_uq UNIQUE (import_batch_id, source_row, raw_row_sha256);


--
-- Name: lead_processing_events lead_processing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_events
    ADD CONSTRAINT lead_processing_events_pkey PRIMARY KEY (stage_event_id);


--
-- Name: lead_processing_events lead_processing_events_semantic_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_events
    ADD CONSTRAINT lead_processing_events_semantic_uq UNIQUE (idempotency_key, stage, status, attempt_no, payload_sha256);


--
-- Name: lead_processing_state lead_processing_state_decision_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_state
    ADD CONSTRAINT lead_processing_state_decision_uq UNIQUE (decision_id);


--
-- Name: lead_processing_state lead_processing_state_lead_run_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_state
    ADD CONSTRAINT lead_processing_state_lead_run_uq UNIQUE (lead_run_id);


--
-- Name: lead_processing_state lead_processing_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_state
    ADD CONSTRAINT lead_processing_state_pkey PRIMARY KEY (idempotency_key);


--
-- Name: model_pricing model_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_pricing
    ADD CONSTRAINT model_pricing_pkey PRIMARY KEY (model, pricing_mode, valid_from);


--
-- Name: workflow_dead_letters workflow_dead_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_dead_letters
    ADD CONSTRAINT workflow_dead_letters_pkey PRIMARY KEY (id);


--
-- Name: workflow_integrity_errors workflow_integrity_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workflow_integrity_errors
    ADD CONSTRAINT workflow_integrity_errors_pkey PRIMARY KEY (id);


--
-- Name: company_validation_runs_stage_event_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX company_validation_runs_stage_event_id_uq ON public.company_validation_runs USING btree (stage_event_id) WHERE (stage_event_id IS NOT NULL);


--
-- Name: idx_company_strategic_reports_lead_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_reports_lead_run ON public.company_strategic_research_reports USING btree (lead_run_id);


--
-- Name: idx_company_strategic_reports_run_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_reports_run_key ON public.company_strategic_research_reports USING btree (strategic_research_run_key);


--
-- Name: idx_company_strategic_research_reports_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_research_reports_batch ON public.company_strategic_research_reports USING btree (import_batch_id);


--
-- Name: idx_company_strategic_research_reports_cnpj_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_research_reports_cnpj_created ON public.company_strategic_research_reports USING btree (cnpj, created_at DESC);


--
-- Name: idx_company_strategic_research_reports_report_json_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_research_reports_report_json_gin ON public.company_strategic_research_reports USING gin (report_json);


--
-- Name: idx_company_strategic_research_reports_test_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_strategic_research_reports_test_case_id ON public.company_strategic_research_reports USING btree (test_case_id);


--
-- Name: idx_company_validation_runs_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_batch ON public.company_validation_runs USING btree (import_batch_id);


--
-- Name: idx_company_validation_runs_batch_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_batch_result ON public.company_validation_runs USING btree (import_batch_id, processing_result);


--
-- Name: idx_company_validation_runs_batch_row; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_batch_row ON public.company_validation_runs USING btree (import_batch_id, source_row);


--
-- Name: idx_company_validation_runs_batch_test_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_batch_test_case_id ON public.company_validation_runs USING btree (import_batch_id, test_case_id);


--
-- Name: idx_company_validation_runs_child_task; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_child_task ON public.company_validation_runs USING btree (child_task_id);


--
-- Name: idx_company_validation_runs_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_cnpj ON public.company_validation_runs USING btree (cnpj);


--
-- Name: idx_company_validation_runs_cost_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_cost_batch ON public.company_validation_runs USING btree (import_batch_id, processing_result, sector_detected);


--
-- Name: idx_company_validation_runs_cost_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_cost_cnpj ON public.company_validation_runs USING btree (cnpj, created_at DESC);


--
-- Name: idx_company_validation_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_created_at ON public.company_validation_runs USING btree (created_at DESC);


--
-- Name: idx_company_validation_runs_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_idempotency_key ON public.company_validation_runs USING btree (idempotency_key);


--
-- Name: idx_company_validation_runs_lead_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_lead_run_id ON public.company_validation_runs USING btree (lead_run_id);


--
-- Name: idx_company_validation_runs_llm_usage_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_llm_usage_gin ON public.company_validation_runs USING gin (llm_usage);


--
-- Name: idx_company_validation_runs_strategic_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_strategic_run ON public.company_validation_runs USING btree (strategic_research_run_key);


--
-- Name: idx_company_validation_runs_test_case_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validation_runs_test_case_id ON public.company_validation_runs USING btree (test_case_id);


--
-- Name: idx_company_validations_evidences_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_evidences_gin ON public.company_validations USING gin (evidences);


--
-- Name: idx_company_validations_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_expires_at ON public.company_validations USING btree (expires_at);


--
-- Name: idx_company_validations_last_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_last_idempotency ON public.company_validations USING btree (last_idempotency_key);


--
-- Name: idx_company_validations_last_lead_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_last_lead_run ON public.company_validations USING btree (last_lead_run_id);


--
-- Name: idx_company_validations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_location ON public.company_validations USING btree (uf, cidade);


--
-- Name: idx_company_validations_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_priority ON public.company_validations USING btree (priority, strategic_tier, trust_verdict);


--
-- Name: idx_company_validations_risk_flags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_validations_risk_flags_gin ON public.company_validations USING gin (risk_flags);


--
-- Name: idx_crm_company_history_account_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_company_history_account_norm ON public.crm_company_history USING gin (account_name_normalized public.gin_trgm_ops) WHERE ((account_name_normalized IS NOT NULL) AND (account_name_normalized <> ''::text));


--
-- Name: idx_crm_company_history_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_company_history_cnpj ON public.crm_company_history USING btree (cnpj) WHERE ((cnpj IS NOT NULL) AND ((cnpj)::text <> ''::text));


--
-- Name: idx_crm_company_history_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_company_history_domain ON public.crm_company_history USING btree (website_domain) WHERE ((website_domain IS NOT NULL) AND (website_domain <> ''::text));


--
-- Name: idx_crm_company_history_suppression; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_company_history_suppression ON public.crm_company_history USING btree (suppression_level, lifecycle_stage, last_modified_at DESC);


--
-- Name: idx_crm_lead_contact_account_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_account_norm ON public.crm_lead_contact_history USING gin (account_name_normalized public.gin_trgm_ops) WHERE ((account_name_normalized IS NOT NULL) AND (account_name_normalized <> ''::text));


--
-- Name: idx_crm_lead_contact_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_cnpj ON public.crm_lead_contact_history USING btree (cnpj) WHERE ((cnpj IS NOT NULL) AND ((cnpj)::text <> ''::text));


--
-- Name: idx_crm_lead_contact_company_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_company_key ON public.crm_lead_contact_history USING btree (company_key);


--
-- Name: idx_crm_lead_contact_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_domain ON public.crm_lead_contact_history USING btree (website_domain) WHERE ((website_domain IS NOT NULL) AND (website_domain <> ''::text));


--
-- Name: idx_crm_lead_contact_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_email ON public.crm_lead_contact_history USING btree (email) WHERE ((email IS NOT NULL) AND (email <> ''::text));


--
-- Name: idx_crm_lead_contact_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crm_lead_contact_phone ON public.crm_lead_contact_history USING btree (phone_digits) WHERE ((phone_digits IS NOT NULL) AND (phone_digits <> ''::text));


--
-- Name: idx_model_pricing_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_model_pricing_lookup ON public.model_pricing USING btree (model, pricing_mode, valid_from DESC);


--
-- Name: idx_workflow_dead_letters_lead_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_dead_letters_lead_run_id ON public.workflow_dead_letters USING btree (lead_run_id);


--
-- Name: idx_workflow_dead_letters_retryable_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_dead_letters_retryable_created_at ON public.workflow_dead_letters USING btree (retryable, created_at DESC);


--
-- Name: idx_workflow_dead_letters_stage_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_dead_letters_stage_created_at ON public.workflow_dead_letters USING btree (stage, created_at DESC);


--
-- Name: idx_workflow_integrity_errors_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_integrity_errors_child ON public.workflow_integrity_errors USING btree (child_task_id, created_at DESC);


--
-- Name: idx_workflow_integrity_errors_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_integrity_errors_lead ON public.workflow_integrity_errors USING btree (lead_run_id, created_at DESC);


--
-- Name: idx_workflow_integrity_errors_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workflow_integrity_errors_status ON public.workflow_integrity_errors USING btree (status, created_at DESC);


--
-- Name: lead_decisions_cnpj_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_decisions_cnpj_latest_idx ON public.lead_decisions USING btree (cnpj_normalizado, created_at DESC, decision_id DESC) WHERE ((decision_status = 'COMPLETED'::text) AND (cnpj_normalizado IS NOT NULL));


--
-- Name: lead_decisions_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_decisions_import_idx ON public.lead_decisions USING btree (import_batch_id, source_row);


--
-- Name: lead_decisions_source_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_decisions_source_hash_idx ON public.lead_decisions USING btree (cnpj_normalizado, source_hash_sha256, workflow_version, expires_at DESC) WHERE (decision_status = 'COMPLETED'::text);


--
-- Name: lead_import_batches_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_import_batches_file_idx ON public.lead_import_batches USING btree (uploaded_file_sha256, last_seen_at DESC);


--
-- Name: lead_import_batches_natural_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_import_batches_natural_uq ON public.lead_import_batches USING btree (uploaded_file_sha256, workflow_version, ruleset_version, prompt_model_version, execution_mode, COALESCE(force_reprocess_token, ''::text));


--
-- Name: lead_input_rows_cnpj_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_input_rows_cnpj_idx ON public.lead_input_rows USING btree (cnpj_normalizado) WHERE (cnpj_normalizado IS NOT NULL);


--
-- Name: lead_input_rows_import_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_input_rows_import_idx ON public.lead_input_rows USING btree (import_batch_id, source_row);


--
-- Name: lead_processing_events_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_processing_events_run_idx ON public.lead_processing_events USING btree (idempotency_key, created_at DESC);


--
-- Name: lead_processing_events_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_processing_events_stage_idx ON public.lead_processing_events USING btree (stage, status, created_at DESC);


--
-- Name: lead_processing_state_cnpj_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_processing_state_cnpj_idx ON public.lead_processing_state USING btree (cnpj_normalizado, updated_at DESC) WHERE (cnpj_normalizado IS NOT NULL);


--
-- Name: lead_processing_state_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lead_processing_state_status_idx ON public.lead_processing_state USING btree (status, next_retry_at, updated_at DESC);


--
-- Name: uq_company_strategic_research_reports_cnpj_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_company_strategic_research_reports_cnpj_version ON public.company_strategic_research_reports USING btree (cnpj, report_version);


--
-- Name: agent_eval_results agent_eval_results_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_eval_results
    ADD CONSTRAINT agent_eval_results_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.agent_eval_cases(id);


--
-- Name: company_strategic_research_reports company_strategic_research_reports_company_validation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_strategic_research_reports
    ADD CONSTRAINT company_strategic_research_reports_company_validation_id_fkey FOREIGN KEY (company_validation_id) REFERENCES public.company_validations(id) ON DELETE SET NULL;


--
-- Name: crm_lead_contact_history crm_lead_contact_history_company_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crm_lead_contact_history
    ADD CONSTRAINT crm_lead_contact_history_company_key_fkey FOREIGN KEY (company_key) REFERENCES public.crm_company_history(company_key) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lead_decisions lead_decisions_idempotency_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_decisions
    ADD CONSTRAINT lead_decisions_idempotency_key_fkey FOREIGN KEY (idempotency_key) REFERENCES public.lead_processing_state(idempotency_key) ON DELETE RESTRICT;


--
-- Name: lead_decisions lead_decisions_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_decisions
    ADD CONSTRAINT lead_decisions_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.lead_import_batches(import_batch_id) ON DELETE RESTRICT;


--
-- Name: lead_decisions lead_decisions_input_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_decisions
    ADD CONSTRAINT lead_decisions_input_row_id_fkey FOREIGN KEY (input_row_id) REFERENCES public.lead_input_rows(input_row_id) ON DELETE RESTRICT;


--
-- Name: lead_input_rows lead_input_rows_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_input_rows
    ADD CONSTRAINT lead_input_rows_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.lead_import_batches(import_batch_id) ON DELETE RESTRICT;


--
-- Name: lead_processing_events lead_processing_events_idempotency_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_events
    ADD CONSTRAINT lead_processing_events_idempotency_key_fkey FOREIGN KEY (idempotency_key) REFERENCES public.lead_processing_state(idempotency_key) ON DELETE RESTRICT;


--
-- Name: lead_processing_state lead_processing_state_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_state
    ADD CONSTRAINT lead_processing_state_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.lead_import_batches(import_batch_id) ON DELETE RESTRICT;


--
-- Name: lead_processing_state lead_processing_state_input_row_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_processing_state
    ADD CONSTRAINT lead_processing_state_input_row_id_fkey FOREIGN KEY (input_row_id) REFERENCES public.lead_input_rows(input_row_id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict v6339MtSSanqoUZEn6AovMcWD4WzT9YeEkwyqUIhPBLsxOnFqAe36hbfXhsHsvf

