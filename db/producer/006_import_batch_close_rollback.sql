-- Remove only the close entry point. Durable close facts already recorded in
-- producer batch manifests remain immutable history.

DROP FUNCTION IF EXISTS
  public.prospecta_close_empresaqui_batch_v1(jsonb);
