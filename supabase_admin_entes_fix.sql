-- ==============================================================================
-- AUTORIZAÇÃO E VISIBILIDADE PARA ADMINISTRADORES DE ENTES (MPF, PF, SPU, ETC.)
-- ==============================================================================
-- Permite que Administradores de órgãos parceiros (entes federativos) visualizem,
-- aprovem e gerenciem nominalmente os servidores da sua própria instituição em qualquer município.
--
-- Execute este script no SQL Editor do seu Supabase Dashboard.
-- ==============================================================================

-- 1. Garante colunas de administração institucional em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS entidade_admin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS entidade TEXT;

-- 2. Função de normalização de siglas institucionais (PostgreSQL)
CREATE OR REPLACE FUNCTION public.get_entidade_sigla(p_entidade text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_raw text;
  v_lower text;
BEGIN
  IF p_entidade IS NULL OR trim(p_entidade) = '' THEN
    RETURN 'Município';
  END IF;

  v_raw := trim(p_entidade);
  v_lower := lower(v_raw);

  IF v_lower = 'geral' OR v_lower = 'pública' OR v_lower = 'publica' OR v_lower = 'público' OR v_lower = 'publico' THEN
    RETURN 'Município';
  END IF;

  IF v_lower LIKE '%mpf%' OR v_lower LIKE '%ministério público%' OR v_lower LIKE '%ministerio publico%' THEN
    RETURN 'MPF';
  END IF;

  IF v_lower LIKE '%polícia federal%' OR v_lower LIKE '%policia federal%' OR v_lower = 'pf' THEN
    RETURN 'PF';
  END IF;

  IF v_lower LIKE '%spu%' OR v_lower LIKE '%patrimônio da união%' OR v_lower LIKE '%patrimonio da uniao%' OR v_lower LIKE '%união%' OR v_lower LIKE '%uniao%' THEN
    RETURN 'SPU';
  END IF;

  IF v_lower LIKE '%prefeitura%' OR v_lower LIKE '%municipal%' OR v_lower LIKE '%município%' OR v_lower LIKE '%municipio%' OR v_lower = 'pmc' OR v_lower = 'pmr' THEN
    RETURN 'Município';
  END IF;

  RETURN v_raw;
END;
$$;

-- 3. Função de verificação se o usuário logado é Administrador da Entidade informada
CREATE OR REPLACE FUNCTION public.is_admin_for_entidade(p_target_entidade text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      -- Administrador pelo perfil (flag entidade_admin ou papel admin)
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.entidade_admin OR p.papel = 'admin' OR p.super_admin)
        AND public.get_entidade_sigla(p.entidade) = public.get_entidade_sigla(p_target_entidade)
    )
    OR EXISTS (
      -- Administrador cadastrado em municipio_membros com papel admin na mesma entidade
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid()
        AND mm.papel = 'admin'
        AND mm.status = 'aprovado'
        AND public.get_entidade_sigla(mm.entidade) = public.get_entidade_sigla(p_target_entidade)
    );
$$;

-- 4. Atualização da Política de Leitura de municipio_membros
DROP POLICY IF EXISTS membros_select ON public.municipio_membros;
CREATE POLICY membros_select ON public.municipio_membros
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
    OR public.is_admin_for_entidade(entidade)
  );

-- 5. Atualização da Política de Atualização de municipio_membros
DROP POLICY IF EXISTS membros_update_admin ON public.municipio_membros;
CREATE POLICY membros_update_admin ON public.municipio_membros
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
    OR public.is_admin_for_entidade(entidade)
  ) WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
    OR public.is_admin_for_entidade(entidade)
  );

-- 6. Atualização da Política de Leitura e Escrita de profiles (para join profiles!user_id na Central de Usuários)
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = profiles.id
        AND (
          public.is_municipio_admin(mm.municipio_id)
          OR public.is_admin_for_entidade(mm.entidade)
        )
    )
    OR (
      profiles.entidade IS NOT NULL
      AND public.is_admin_for_entidade(profiles.entidade)
    )
  );

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR public.is_admin()
    OR public.is_super_admin()
    OR (
      profiles.entidade IS NOT NULL
      AND public.is_admin_for_entidade(profiles.entidade)
    )
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = profiles.id
        AND (
          public.is_municipio_admin(mm.municipio_id)
          OR public.is_admin_for_entidade(mm.entidade)
        )
    )
  ) WITH CHECK (
    id = auth.uid()
    OR public.is_admin()
    OR public.is_super_admin()
    OR (
      profiles.entidade IS NOT NULL
      AND public.is_admin_for_entidade(profiles.entidade)
    )
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = profiles.id
        AND (
          public.is_municipio_admin(mm.municipio_id)
          OR public.is_admin_for_entidade(mm.entidade)
        )
    )
  );

-- 7. Comentários para auditoria
COMMENT ON FUNCTION public.is_admin_for_entidade IS 'Verifica soberania administrativa interinstitucional de entes parceiros (MPF, PF, SPU, etc.)';
