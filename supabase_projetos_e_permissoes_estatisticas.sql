-- ==============================================================================
-- ATUALIZAÇÃO DE BANCO: ESTATÍSTICAS, EDIÇÃO DE TEMA E PERSISTÊNCIA DE PROJETOS
-- ==============================================================================
-- Execute este script no SQL Editor do Supabase para garantir suporte às
-- novas colunas de controle granular de visualização e persistência de projetos.
-- ==============================================================================

-- 1. NOVAS COLUNAS NA TABELA permissoes_camada
ALTER TABLE public.permissoes_camada
  ADD COLUMN IF NOT EXISTS pode_estatistica BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_editar_tema BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.permissoes_camada.pode_estatistica IS 'Permissão de leitura para o painel de estatísticas da camada (gráficos/totais)';
COMMENT ON COLUMN public.permissoes_camada.pode_editar_tema IS 'Permissão para customizar o tema compartilhado (engrenagem de cores e estilos)';

-- 2. NOVA COLUNA NA TABELA profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pode_estatistica_cruzada BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.pode_estatistica_cruzada IS 'Permissão de leitura para o módulo de Geoestatística e Análise Espacial Cruzada';

-- 3. GARANTIA DA TABELA user_projetos E POLÍTICAS RLS ROBUSTAS
CREATE TABLE IF NOT EXISTS public.user_projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  municipio_id UUID,
  nome TEXT NOT NULL,
  descricao TEXT,
  camadas_ids JSONB DEFAULT '[]'::jsonb,
  rasters_ids JSONB DEFAULT '[]'::jsonb,
  camadas_visiveis JSONB DEFAULT '[]'::jsonb,
  raster_ativo_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_projetos ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.user_projetos TO authenticated;
GRANT ALL ON TABLE public.user_projetos TO service_role;

DROP POLICY IF EXISTS user_projetos_select_policy ON public.user_projetos;
CREATE POLICY user_projetos_select_policy ON public.user_projetos
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_insert_policy ON public.user_projetos;
CREATE POLICY user_projetos_insert_policy ON public.user_projetos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_update_policy ON public.user_projetos;
CREATE POLICY user_projetos_update_policy ON public.user_projetos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_projetos_delete_policy ON public.user_projetos;
CREATE POLICY user_projetos_delete_policy ON public.user_projetos
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 4. ÍNDICES DE DESEMPENHO
CREATE INDEX IF NOT EXISTS idx_user_projetos_user_id ON public.user_projetos(user_id);
CREATE INDEX IF NOT EXISTS idx_user_projetos_municipio_id ON public.user_projetos(municipio_id);
