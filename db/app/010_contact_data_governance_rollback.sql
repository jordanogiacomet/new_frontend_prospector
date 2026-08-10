-- Rollback for a disposable non-production target only. This removes contact
-- PII and governance history and therefore must never be used as production
-- retention or rollback behavior.

DROP TABLE IF EXISTS prospecting_app.contact_governance_events;
DROP TABLE IF EXISTS prospecting_app.contact_rights_requests;
DROP TABLE IF EXISTS prospecting_app.contact_suppressions;
DROP TABLE IF EXISTS prospecting_app.contact_records;
DROP TABLE IF EXISTS prospecting_app.contact_reveal_requests;
DROP TABLE IF EXISTS prospecting_app.contact_candidates;
DROP TABLE IF EXISTS prospecting_app.contact_enrichment_v2_requests;

