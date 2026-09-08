-- ==============================================================================
-- SETUP: COLUNA DE LOGO PARA A TABELA DE ENTIDADES PADRÃO
-- ==============================================================================

-- 1. Adiciona a coluna logo_url na tabela entidades_padrao se ainda não existir
ALTER TABLE public.entidades_padrao ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.entidades_padrao.logo_url IS 'URL da imagem ou brasão oficial da entidade institucional parceira';
