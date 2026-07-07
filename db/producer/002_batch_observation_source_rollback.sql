-- Roll back the local/non-production X4 producer batch observation source.
-- Do not run against production without separate producer-owner approval.

DROP VIEW IF EXISTS public.prospecta_import_batch_observations_v1;
