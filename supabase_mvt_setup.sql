-- ============================================================
-- SCRIPT DE IMPLEMENTAÇÃO DE VECTOR TILES (MVT) — FASE 2
-- Execute no SQL Editor do Supabase (uma única vez)
-- ============================================================

-- Cria a função que fatiará os polígonos em azulejos (Tiles) sob demanda
-- Ela recebe o Zoom (z), as coordenadas da tela (x, y) e o ID da Camada.
CREATE OR REPLACE FUNCTION get_tile(z INT, x INT, y INT, p_theme_id TEXT)
RETURNS bytea AS $$
DECLARE
  bounds geometry;
  bounds_4326 geometry;
  result bytea;
BEGIN
  -- Converte as coordenadas da tela (Leaflet) para uma Bounding Box (Caixa Delimitadora) no padrão Mercator (3857)
  bounds := ST_TileEnvelope(z, x, y);
  -- Converte a Bounding Box para GPS padrão (4326) para conseguir usar os índices super rápidos que criamos na Fase 1
  bounds_4326 := ST_Transform(bounds, 4326);
  
  -- Extrai os polígonos do banco, corta apenas o que cabe na Bounding Box e converte para Vector Tile binário (MVT)
  SELECT ST_AsMVT(tile, 'feicoes', 4096, 'geom')
  INTO result
  FROM (
    SELECT 
      id,
      -- ST_AsMVTGeom alinha os vértices do polígono na grade de 4096px do Tile
      ST_AsMVTGeom(ST_Transform(geometria, 3857), bounds, 4096, 64, true) AS geom
    FROM feicoes
    WHERE theme_id = p_theme_id
      AND geometria && bounds_4326 -- Usa o índice espacial GiST para não varrer o banco todo
  ) AS tile;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Dá permissão para o usuário anônimo (Front-end) conseguir chamar essa função via API
GRANT EXECUTE ON FUNCTION get_tile(INT, INT, INT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_tile(INT, INT, INT, TEXT) TO authenticated;
