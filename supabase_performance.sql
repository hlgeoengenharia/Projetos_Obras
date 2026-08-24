-- ============================================================
-- SCRIPT DE OTIMIZAÇÃO DE PERFORMANCE — CONSTRUCTIVE GIS
-- Execute no SQL Editor do Supabase (uma única vez)
-- ============================================================

-- 1. Índice GiST na geometria (essencial para consultas espaciais)
--    Acelera: ST_Intersects, ST_Within, ST_DWithin, bounding box queries
CREATE INDEX IF NOT EXISTS feicoes_geometria_gist_idx
  ON feicoes USING GIST (geometria);

-- 2. Índice no theme_id (filtragem por camada)
--    Acelera: WHERE theme_id = '...' (usado em toda paginação e lazy load)
CREATE INDEX IF NOT EXISTS feicoes_theme_id_idx
  ON feicoes (theme_id);

-- 3. Índice combinado theme_id + id (para o lazy load de propriedades)
--    Acelera: SELECT id, propriedades WHERE theme_id = '...' RANGE ...
CREATE INDEX IF NOT EXISTS feicoes_theme_id_id_idx
  ON feicoes (theme_id, id);

-- 4. Atualiza as estatísticas do planejador de queries
--    Faz o PostgreSQL escolher os melhores planos de execução
ANALYZE feicoes;

-- ============================================================
-- VERIFICAÇÃO — rode depois para confirmar os índices criados:
-- ============================================================
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'feicoes'
-- ORDER BY indexname;
