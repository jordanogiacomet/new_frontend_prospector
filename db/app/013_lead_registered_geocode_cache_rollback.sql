-- Disposable non-production rollback only. Production rollback disables the
-- feature and preserves the cache until a separately approved retention step.

DROP TABLE IF EXISTS prospecting_app.lead_registered_geocode_cache;

