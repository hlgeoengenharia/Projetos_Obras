-- ==============================================================================
-- OTIMIZAÇÃO DE PERFORMANCE PARA A PESQUISA INTERINSTITUCIONAL
-- Resolve o erro 500 (canceling statement due to statement timeout)
-- ==============================================================================

-- 1. Habilita a extensão de trigramas (nativa do PostgreSQL/Supabase)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Cria um índice GIN super rápido para buscas textuais (ILIKE) dentro do JSONB
-- Esse índice vai acelerar instantaneamente qualquer busca por partes de texto 
-- (como números de processos ou pedaços de palavras) dentro do campo propriedades.
CREATE INDEX IF NOT EXISTS feicoes_propriedades_trgm_idx 
ON public.feicoes USING gin ((propriedades::text) gin_trgm_ops);

-- ==============================================================================
-- Instrução: Execute este script completo no SQL Editor do Supabase.
-- Como a tabela pode ser grande, pode demorar alguns segundos/minutos.
-- Após concluir, a pesquisa via RPC funcionará em milissegundos sem Timeout (Erro 500).
-- ==============================================================================
