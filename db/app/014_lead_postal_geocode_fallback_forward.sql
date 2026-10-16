-- Add an explicit postal-code precision for the registered-location map.
-- The cache continues to exclude addresses, lookup queries and raw provider
-- responses. Existing unavailable rows are reclassified to the full lookup
-- pipeline before the stricter source/precision relationship is installed.

BEGIN;

ALTER TABLE prospecting_app.lead_registered_geocode_cache
  DROP CONSTRAINT lead_registered_geocode_cache_source_ck,
  DROP CONSTRAINT lead_registered_geocode_cache_coordinates_ck;

UPDATE prospecting_app.lead_registered_geocode_cache
SET source = 'BRASILAPI_NOMINATIM_CEP_V2'
WHERE status = 'UNAVAILABLE';

ALTER TABLE prospecting_app.lead_registered_geocode_cache
  ADD CONSTRAINT lead_registered_geocode_cache_source_ck
    CHECK (
      source IN (
        'BRASILAPI_NOMINATIM',
        'BRASILAPI_CEP_V2',
        'BRASILAPI_NOMINATIM_CEP_V2'
      )
    ),
  ADD CONSTRAINT lead_registered_geocode_cache_coordinates_ck
    CHECK (
      (
        status = 'AVAILABLE'
        AND latitude BETWEEN -90 AND 90
        AND longitude BETWEEN -180 AND 180
        AND (
          (
            precision = 'REGISTERED_ADDRESS'
            AND source = 'BRASILAPI_NOMINATIM'
          )
          OR
          (
            precision = 'REGISTERED_POSTAL_CODE'
            AND source = 'BRASILAPI_CEP_V2'
          )
        )
      )
      OR
      (
        status = 'UNAVAILABLE'
        AND latitude IS NULL
        AND longitude IS NULL
        AND precision IS NULL
        AND source = 'BRASILAPI_NOMINATIM_CEP_V2'
      )
    );

COMMIT;
