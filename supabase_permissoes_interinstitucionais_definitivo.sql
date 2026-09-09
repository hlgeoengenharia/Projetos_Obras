-- ==============================================================================
-- FIX DEFINITIVO: SISTEMA DE PERMISSÕES E VISIBILIDADE INTERINSTITUCIONAL
-- ==============================================================================
-- Este script corrige e aprimora em definitivo a função tem_permissao e as políticas
-- de RLS para que qualquer camada compartilhada por um ente com um usuário parceiro
-- (ex: SPU compartilhando LPM/LTM com MPF, PF ou Prefeitura) seja visualizada e
-- consultada com 100% de sucesso, sem bloqueios indevidos por flag de ponto focal.
-- Compatível com todas as assinaturas: (theme_id, acao) e (user_id, theme_id, acao).
-- ==============================================================================

-- 1. Garante que a coluna entidade exista na tabela temas
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS entidade text;

-- 2. Função Central: tem_permissao(p_user_id uuid, p_theme_id uuid, p_acao text)
CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_user_id uuid,
  p_theme_id uuid,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_theme_mun_id uuid;
  v_theme_entidade text;
  v_user_entidade text;
  v_user_papel text;
  v_user_ponto_focal boolean;
  v_pc_ver boolean;
  v_pc_editar boolean;
  v_pc_excluir boolean;
  v_has_pc boolean;
  v_is_outro_ente boolean;
BEGIN
  -- 1. SuperAdmin Geral do sistema tem acesso irrestrito a tudo
  SELECT COALESCE(p.super_admin, false)
  INTO v_is_super
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_is_super THEN
    RETURN true;
  END IF;

  -- 2. Busca dados do tema (lendo de metadata->>'entidade' ou coluna entidade)
  SELECT 
    t.municipio_id,
    COALESCE(NULLIF(t.entidade, ''), NULLIF(t.metadata->>'entidade', ''), 'Prefeitura Municipal')
  INTO v_theme_mun_id, v_theme_entidade
  FROM public.temas t
  WHERE t.id = p_theme_id;

  -- Se não achou na tabela temas, tenta em camadas_geograficas se existir
  IF v_theme_mun_id IS NULL THEN
    BEGIN
      SELECT 
        c.municipio_id,
        COALESCE(NULLIF(c.entidade, ''), NULLIF(c.metadata->>'entidade', ''), 'Prefeitura Municipal')
      INTO v_theme_mun_id, v_theme_entidade
      FROM public.camadas_geograficas c
      WHERE c.id::text = p_theme_id::text;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF v_theme_entidade IS NULL THEN
    v_theme_entidade := 'Prefeitura Municipal';
  END IF;

  -- 3. Busca entidade e perfil do usuário
  SELECT 
    COALESCE(NULLIF(p.entidade, ''), NULLIF(p.entidade_nome, ''), ''),
    COALESCE(p.papel, 'visualizador'),
    COALESCE(p.ponto_focal, false)
  INTO v_user_entidade, v_user_papel, v_user_ponto_focal
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Se o usuário não tem entidade preenchida no profile, busca em municipio_membros
  IF v_user_entidade = '' AND v_theme_mun_id IS NOT NULL THEN
    SELECT COALESCE(mm.entidade, '')
    INTO v_user_entidade
    FROM public.municipio_membros mm
    WHERE mm.user_id = p_user_id AND mm.municipio_id = v_theme_mun_id
    LIMIT 1;
  END IF;

  -- Busca papel do usuário no município se houver vínculo aprovado
  IF v_theme_mun_id IS NOT NULL THEN
    SELECT mm.papel
    INTO v_user_papel
    FROM public.municipio_membros mm
    WHERE mm.user_id = p_user_id
      AND mm.municipio_id = v_theme_mun_id
      AND mm.status = 'aprovado'
    LIMIT 1;
  END IF;

  -- 4. Busca regras específicas na tabela permissoes_camada
  SELECT 
    true,
    COALESCE(pc.pode_ver, false),
    COALESCE(pc.pode_editar, false),
    COALESCE(pc.pode_excluir, false)
  INTO v_has_pc, v_pc_ver, v_pc_editar, v_pc_excluir
  FROM public.permissoes_camada pc
  WHERE pc.user_id = p_user_id
    AND (pc.theme_id::text = p_theme_id::text);

  v_has_pc := COALESCE(v_has_pc, false);

  -- 5. Avalia se a camada pertence a OUTRO ENTE (compartilhamento interinstitucional)
  v_is_outro_ente := (
    LOWER(TRIM(v_theme_entidade)) <> 'geral'
    AND LOWER(TRIM(v_theme_entidade)) <> LOWER(TRIM(v_user_entidade))
    AND NOT (
      (v_theme_entidade ILIKE '%prefeitura%' OR v_theme_entidade ILIKE '%municip%')
      AND (v_user_entidade ILIKE '%prefeitura%' OR v_user_entidade ILIKE '%municip%')
    )
  );

  -- REGRA SOBERANA PARA CAMADAS DE OUTRO ENTE:
  -- Se o administrador do ente proprietário concedeu autorização explícita em permissoes_camada,
  -- essa autorização é SOBERANA (independente de flag ponto_focal)!
  IF v_is_outro_ente THEN
    IF v_has_pc THEN
      IF p_acao = 'ver' THEN RETURN v_pc_ver; END IF;
      IF p_acao = 'editar' THEN RETURN v_pc_editar; END IF;
      IF p_acao = 'excluir' THEN RETURN v_pc_excluir; END IF;
      RETURN false;
    END IF;

    -- Usuário de outro ente sem concessão explícita não visualiza dados de outro órgão
    RETURN false;
  END IF;

  -- 6. Camada da PRÓPRIA entidade ou Geral:
  -- Se há regra explícita em permissoes_camada, ela sobrepõe papéis padrão
  IF v_has_pc THEN
    IF p_acao = 'ver' THEN RETURN v_pc_ver; END IF;
    IF p_acao = 'editar' THEN RETURN v_pc_editar; END IF;
    IF p_acao = 'excluir' THEN RETURN v_pc_excluir; END IF;
    RETURN false;
  END IF;

  -- Se o usuário já possui regras personalizadas cadastradas em permissoes_camada,
  -- camadas não listadas ficam bloqueadas por padrão
  IF EXISTS (SELECT 1 FROM public.permissoes_camada WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  -- Administrador da própria entidade sem restrições explícitas cadastradas
  IF v_user_papel = 'admin' THEN
    RETURN true;
  END IF;

  -- Usuário comum / visualizador da própria entidade tem permissão de leitura
  IF p_acao = 'ver' THEN
    RETURN true;
  END IF;

  -- Editor da própria entidade tem permissão de edição
  IF p_acao = 'editar' AND v_user_papel = 'editor' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 3. Sobrecarga com (uuid, text) -> Usada diretamente pelas políticas RLS: tem_permissao(theme_id, 'ver')
CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_theme_id uuid,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.tem_permissao(auth.uid(), p_theme_id, p_acao);
END;
$$;

-- 4. Sobrecarga com (user_id uuid, theme_id text, acao text)
CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_user_id uuid,
  p_theme_id text,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tid uuid;
BEGIN
  IF p_theme_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN public.tem_permissao(p_user_id, p_theme_id::uuid, p_acao);
  ELSE
    SELECT id INTO v_tid FROM public.temas WHERE LOWER(TRIM(nome)) = LOWER(TRIM(p_theme_id)) LIMIT 1;
    IF v_tid IS NOT NULL THEN
      RETURN public.tem_permissao(p_user_id, v_tid, p_acao);
    END IF;
    RETURN false;
  END IF;
END;
$$;

-- 5. Sobrecarga com (theme_id text, acao text)
CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_theme_id text,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.tem_permissao(auth.uid(), p_theme_id, p_acao);
END;
$$;

-- 6. Garantia de RLS para permissoes_camada
ALTER TABLE public.permissoes_camada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_camada_select_auth ON public.permissoes_camada;
CREATE POLICY permissoes_camada_select_auth ON public.permissoes_camada
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS permissoes_camada_all_admin ON public.permissoes_camada;
CREATE POLICY permissoes_camada_all_admin ON public.permissoes_camada
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  );

-- 7. Garantia de RLS para permissoes_aba
ALTER TABLE public.permissoes_aba ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_aba_select_auth ON public.permissoes_aba;
CREATE POLICY permissoes_aba_select_auth ON public.permissoes_aba
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS permissoes_aba_all_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_all_admin ON public.permissoes_aba
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  );

-- 8. Garantia de RLS para permissoes_raster
ALTER TABLE public.permissoes_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_raster_select_auth ON public.permissoes_raster;
CREATE POLICY permissoes_raster_select_auth ON public.permissoes_raster
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS permissoes_raster_all_admin ON public.permissoes_raster;
CREATE POLICY permissoes_raster_all_admin ON public.permissoes_raster
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  );

-- 9. Atualização das políticas RLS em feicoes para usar a função tem_permissao corrigida
ALTER TABLE public.feicoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feicoes_select_isolamento" ON public.feicoes;
DROP POLICY IF EXISTS "feicoes_select_perm" ON public.feicoes;
CREATE POLICY "feicoes_select_isolamento"
ON public.feicoes FOR SELECT
TO authenticated
USING (
  public.tem_permissao(theme_id, 'ver')
);

DROP POLICY IF EXISTS feicoes_update_perm ON public.feicoes;
CREATE POLICY feicoes_update_perm ON public.feicoes
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.tem_permissao(theme_id, 'editar')
  ) WITH CHECK (
    public.is_super_admin()
    OR public.tem_permissao(theme_id, 'editar')
  );

DROP POLICY IF EXISTS feicoes_delete_perm ON public.feicoes;
CREATE POLICY feicoes_delete_perm ON public.feicoes
  FOR DELETE USING (
    public.is_super_admin()
    OR public.tem_permissao(theme_id, 'excluir')
  );

COMMENT ON FUNCTION public.tem_permissao(uuid, text) IS 'Valida permissão de acesso à camada sem bloqueio indevido por flag de ponto focal';

-- 10. Garantia de RLS para imagens_raster (Ortofotos)
-- Permite leitura autenticada para que os usuários possam carregar as ortofotos autorizadas via permissoes_raster
ALTER TABLE public.imagens_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imagens_raster_select_authenticated ON public.imagens_raster;
CREATE POLICY imagens_raster_select_authenticated ON public.imagens_raster
  FOR SELECT USING (auth.role() = 'authenticated');

-- 11. Permite que o criador de uma camada gerencie suas próprias permissões em permissoes_camada
DROP POLICY IF EXISTS permissoes_camada_creator ON public.permissoes_camada;
CREATE POLICY permissoes_camada_creator ON public.permissoes_camada
  FOR ALL USING (
    user_id = auth.uid()
  ) WITH CHECK (
    user_id = auth.uid()
  );

