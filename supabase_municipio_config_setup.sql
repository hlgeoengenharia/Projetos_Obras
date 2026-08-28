-- supabase_municipio_config_setup.sql
-- TABELA DE CONFIGURAÇÕES GERAIS E ANÁLISES ESPACIAIS POR MUNICÍPIO

CREATE TABLE IF NOT EXISTS public.municipio_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  config_chave text NOT NULL,
  config_valor jsonb NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(municipio_id, config_chave)
);

-- Ativar RLS
ALTER TABLE public.municipio_config ENABLE ROW LEVEL SECURITY;

-- Limpar policies anteriores se existirem
DROP POLICY IF EXISTS "Leitura de configuracoes por membros do municipio" ON public.municipio_config;
DROP POLICY IF EXISTS "Gravacao de configuracoes por administradores" ON public.municipio_config;

-- Política de Leitura: Usuários com acesso ao município podem ler as configurações
CREATE POLICY "Leitura de configuracoes por membros do municipio"
  ON public.municipio_config
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.municipio_id = municipio_config.municipio_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'aprovado'
    )
  );

-- Política de Escrita: Administradores do município ou administradores gerais podem salvar
CREATE POLICY "Gravacao de configuracoes por administradores"
  ON public.municipio_config
  FOR ALL
  USING (
    public.is_admin()
    OR public.is_municipio_admin(municipio_config.municipio_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_municipio_admin(municipio_config.municipio_id)
  );
