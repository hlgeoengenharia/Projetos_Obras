-- ==============================================================================
-- SISTEMA DE COMPARTILHAMENTO INTERINSTITUCIONAL RESTRITO POR PONTO FOCAL
-- ==============================================================================
-- Este script implementa o modelo de segurança e governança para compartilhamento
-- sigiloso de camadas vetoriais e ortofotos (imagens raster) entre entes públicos
-- (Prefeitura Municipal, MPF, Polícia Federal, SPU, etc.).
-- ==============================================================================

-- 1. CAMPO DE PONTO FOCAL EM PROFILES
-- Permite que o administrador de um ente autorize nominalmente quais servidores
-- da sua equipe podem ser visualizados por outros órgãos para receber dados externos.
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ponto_focal boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.ponto_focal IS 
'Indica se o servidor é Ponto Focal Interinstitucional autorizado a receber dados de outros entes.';

-- Garante que o próprio usuário (incluindo o próprio Admin) ou administradores
-- possam atualizar o status de ponto_focal em profiles
DROP POLICY IF EXISTS profiles_update_ponto_focal ON public.profiles;
CREATE POLICY profiles_update_ponto_focal ON public.profiles
  FOR UPDATE USING (
    id = auth.uid() 
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm 
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin'
    )
  );

-- 2. AJUSTES NA TABELA IMAGENS_RASTER (ORTOFOTOS)
-- Registra a entidade proprietária e se a ortofoto está disponível para compartilhamento externo.
ALTER TABLE public.imagens_raster 
ADD COLUMN IF NOT EXISTS entidade text DEFAULT 'Prefeitura Municipal';

ALTER TABLE public.imagens_raster 
ADD COLUMN IF NOT EXISTS compartilhada boolean DEFAULT false;

COMMENT ON COLUMN public.imagens_raster.entidade IS 
'Nome do ente governamental proprietário da ortofoto (ex: Prefeitura Municipal, MPF, SPU).';

COMMENT ON COLUMN public.imagens_raster.compartilhada IS 
'Se true, a ortofoto pode ser visualizada por pontos focais autorizados de outros entes.';

-- 3. AUDITORIA EM PERMISSOES_CAMADA
-- Registra quem concedeu o acesso para auditoria interinstitucional
ALTER TABLE public.permissoes_camada 
ADD COLUMN IF NOT EXISTS concedido_por uuid REFERENCES public.profiles(id);

-- 4. TABELA DE PERMISSÕES PARA ORTOFOTOS (PERMISSOES_RASTER)
-- Modelo idêntico ao permissoes_camada, garantindo o controle pontual por usuário.
CREATE TABLE IF NOT EXISTS public.permissoes_raster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  raster_id uuid NOT NULL REFERENCES public.imagens_raster(id) ON DELETE CASCADE,
  pode_ver boolean NOT NULL DEFAULT true,
  concedido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, raster_id)
);

COMMENT ON TABLE public.permissoes_raster IS 
'Permissões granulares de acesso a ortofotos fatiadas e imagens raster por usuário.';

-- 5. ROW LEVEL SECURITY (RLS) PARA PERMISSOES_RASTER
ALTER TABLE public.permissoes_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_raster_select_authenticated ON public.permissoes_raster;
CREATE POLICY permissoes_raster_select_authenticated ON public.permissoes_raster
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS permissoes_raster_all_admin ON public.permissoes_raster;
CREATE POLICY permissoes_raster_all_admin ON public.permissoes_raster
  FOR ALL USING (
    public.is_super_admin() OR 
    EXISTS (
      SELECT 1 FROM public.municipio_membros mm 
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin'
    )
  );

-- 6. ATUALIZAÇÃO DAS POLÍTICAS DE RLS DE IMAGENS_RASTER
DROP POLICY IF EXISTS imagens_raster_select_authenticated ON public.imagens_raster;
CREATE POLICY imagens_raster_select_authenticated ON public.imagens_raster
  FOR SELECT USING (
    -- SuperAdmin vê tudo
    public.is_super_admin() 
    OR
    -- Usuários da mesma entidade
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() 
      AND (
        (p.entidade IS NOT NULL AND LOWER(TRIM(p.entidade)) = LOWER(TRIM(imagens_raster.entidade)))
        OR imagens_raster.entidade IS NULL 
        OR LOWER(TRIM(imagens_raster.entidade)) = 'geral'
        OR LOWER(TRIM(imagens_raster.entidade)) = 'público'
        OR LOWER(TRIM(imagens_raster.entidade)) = 'publico'
      )
    )
    OR
    -- Usuário com permissão explícita em permissoes_raster
    EXISTS (
      SELECT 1 FROM public.permissoes_raster pr 
      WHERE pr.raster_id = imagens_raster.id 
      AND pr.user_id = auth.uid() 
      AND pr.pode_ver = true
    )
  );

-- 7. PERMITIR QUE USUÁRIO REJEITADO SOLICITE NOVO ACESSO
-- Permite que o próprio usuário atualize sua solicitação rejeitada para pendente ao solicitar novo acesso.
DROP POLICY IF EXISTS membros_update_self_rejeitado ON public.municipio_membros;
CREATE POLICY membros_update_self_rejeitado ON public.municipio_membros
  FOR UPDATE USING (
    user_id = auth.uid() AND status = 'rejeitado'
  ) WITH CHECK (
    user_id = auth.uid() AND status = 'pendente' AND papel = 'visualizador'
  );

-- 8. SINCRONIZAÇÃO DE ENTIDADE (PROFILES -> MUNICIPIO_MEMBROS)
-- Garante a coluna cargo em profiles e sincroniza a entidade oficial com municipio_membros
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;

UPDATE public.municipio_membros mm
SET entidade = p.entidade
FROM public.profiles p
WHERE mm.user_id = p.id
  AND p.entidade IS NOT NULL;



