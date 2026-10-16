-- Organization-scoped coordinate cache for the registered-address map.
-- Registered addresses, provider queries and raw responses are intentionally
-- absent from this schema and must remain process-memory-only.

CREATE TABLE IF NOT EXISTS prospecting_app.lead_registered_geocode_cache (
  organization_id text NOT NULL,
  cnpj_normalizado text NOT NULL,
  status text NOT NULL,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  precision text,
  source text NOT NULL,
  resolved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,

  CONSTRAINT lead_registered_geocode_cache_pk
    PRIMARY KEY (organization_id, cnpj_normalizado),
  CONSTRAINT lead_registered_geocode_cache_org_ck
    CHECK (prospecting_app.text_is_present(organization_id, 128)),
  CONSTRAINT lead_registered_geocode_cache_cnpj_ck
    CHECK (cnpj_normalizado ~ '^[0-9]{14}$'),
  CONSTRAINT lead_registered_geocode_cache_status_ck
    CHECK (status IN ('AVAILABLE', 'UNAVAILABLE')),
  CONSTRAINT lead_registered_geocode_cache_source_ck
    CHECK (source = 'BRASILAPI_NOMINATIM'),
  CONSTRAINT lead_registered_geocode_cache_time_ck
    CHECK (expires_at > resolved_at),
  CONSTRAINT lead_registered_geocode_cache_coordinates_ck
    CHECK (
      (
        status = 'AVAILABLE'
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
        AND precision = 'REGISTERED_ADDRESS'
      )
      OR
      (
        status = 'UNAVAILABLE'
        AND latitude IS NULL
        AND longitude IS NULL
        AND precision IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS lead_registered_geocode_cache_expiry_idx
  ON prospecting_app.lead_registered_geocode_cache (
    organization_id,
    expires_at,
    cnpj_normalizado
  );

REVOKE ALL ON TABLE
  prospecting_app.lead_registered_geocode_cache
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prospecta_app_rw') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE
      prospecting_app.lead_registered_geocode_cache
    TO prospecta_app_rw;

    REVOKE DELETE ON TABLE
      prospecting_app.lead_registered_geocode_cache
    FROM prospecta_app_rw;
  END IF;
END $$;

