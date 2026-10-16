-- Postal-code cache rows are expendable derived data and cannot be represented
-- by the prior precision contract. Remove only those rows before restoring it.

BEGIN;

DELETE FROM prospecting_app.lead_registered_geocode_cache
WHERE source = 'BRASILAPI_CEP_V2';

ALTER TABLE prospecting_app.lead_registered_geocode_cache
  DROP CONSTRAINT lead_registered_geocode_cache_source_ck,
  DROP CONSTRAINT lead_registered_geocode_cache_coordinates_ck;

UPDATE prospecting_app.lead_registered_geocode_cache
SET source = 'BRASILAPI_NOMINATIM'
WHERE status = 'UNAVAILABLE';

ALTER TABLE prospecting_app.lead_registered_geocode_cache
  ADD CONSTRAINT lead_registered_geocode_cache_source_ck
    CHECK (source = 'BRASILAPI_NOMINATIM'),
  ADD CONSTRAINT lead_registered_geocode_cache_coordinates_ck
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
    );

COMMIT;
