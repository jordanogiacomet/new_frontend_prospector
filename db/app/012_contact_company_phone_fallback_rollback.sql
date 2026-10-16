-- Disposable non-production rollback only. This destroys encrypted fallback
-- values and must not be used as a production rollback strategy.

DROP TABLE IF EXISTS prospecting_app.contact_company_phone_fallbacks;
