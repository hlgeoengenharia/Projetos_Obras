-- ==============================================================================
-- SISTEMA DE PROJETOS E WORKSPACES (ÁREAS DE TRABALHO) POR USUÁRIO
-- ==============================================================================
-- Permite que cada usuário crie projetos personalizados, agrupando camadas
-- vetoriais e ortofotos de acordo com suas demandas de trabalho específicas.
-- ==============================================================================

-- 1. Criação da tabela user_projetos
CREATE TABLE IF NOT EXISTS public.user_projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  municipio_id UUID REFERENCES public.municipios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  camadas_ids JSONB DEFAULT '[]'::jsonb,
  rasters_ids JSONB DEFAULT '[]'::jsonb,
  camadas_visiveis JSONB DEFAULT '[]'::jsonb,
  raster_ativo_id UUID,
  centro_lat DOUBLE PRECISION,
  centro_lng DOUBLE PRECISION,
  zoom INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_projetos_user_id ON public.user_projetos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projetos_municipio_id ON public.user_projetos(municipio_id);

-- 3. Habilitação de Segurança por Linha (RLS)
ALTER TABLE public.user_projetos ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de RLS: Cada usuário acessa, cria, edita e deleta SOMENTE seus projetos
DROP POLICY IF EXISTS user_projetos_select_policy ON public.user_projetos;
CREATE POLICY user_projetos_select_policy ON public.user_projetos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_insert_policy ON public.user_projetos;
CREATE POLICY user_projetos_insert_policy ON public.user_projetos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_update_policy ON public.user_projetos;
CREATE POLICY user_projetos_update_policy ON public.user_projetos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_delete_policy ON public.user_projetos;
CREATE POLICY user_projetos_delete_policy ON public.user_projetos
  FOR DELETE USING (auth.uid() = user_id);

-- 5. Comentários para documentação
COMMENT ON TABLE public.user_projetos IS 'Projetos e áreas de trabalho personalizadas com camadas e ortofotos selecionadas por usuário';
