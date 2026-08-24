-- ============================================================
-- SCRIPT DE CARREGAMENTO POR VIEWPORT (BBOX) — FASE 1b
-- Execute no SQL Editor do Supabase (uma única vez)
-- Depende dos índices criados em supabase_performance.sql
-- ============================================================

-- Busca apenas as feições de um tema cuja geometria intersecta
-- a área (bounding box) atualmente visível no mapa.
CREATE OR REPLACE FUNCTION get_features_bbox(
  p_theme_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
RETURNS TABLE(id uuid, theme_id uuid, geometria geometry) AS $$
  SELECT id, theme_id, geometria
  FROM feicoes
  WHERE theme_id = p_theme_id
    AND geometria && ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION get_features_bbox(uuid, double precision, double precision, double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION get_features_bbox(uuid, double precision, double precision, double precision, double precision) TO authenticated;
