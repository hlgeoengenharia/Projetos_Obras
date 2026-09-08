-- ==============================================================================
-- FIX DEFINITIVO: SISTEMA DE PERMISSÕES E VISIBILIDADE INTERINSTITUCIONAL
-- ==============================================================================
-- Este script corrige e aprimora em definitivo a função tem_permissao e as políticas
-- de RLS para que qualquer camada compartilhada por um ente com um usuário parceiro
-- (ex: SPU compartilhando LPM/LTM com MPF, PF ou Prefeitura) seja visualizada e
-- consultada com 100% de sucesso, sem bloqueios indevidos por flag de ponto focal.
-- ==============================================================================

-- 1. Recria a função tem_permissao com a regra de ouro:
-- Concessão explícita em permissoes_camada é soberana para qualquer usuário!
CREATE OR REPLACE FUNCTION public.tem_permissao(
  p_user_id uuid,
  p_theme_id text,
  p_acao text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_superadmin boolean;
  v_user_entidade text;
  v_user_papel text;
  v_user_ponto_focal boolean;
  v_theme_entidade text;
  v_has_pc boolean;
  v_pc_ver boolean;
  v_pc_editar boolean;
  v_pc_excluir boolean;
  v_is_outro_ente boolean;
BEGIN
  -- 1. SuperAdmin geral tem acesso irrestrito a todas as camadas e ações
  SELECT COALESCE(p.super_admin, false)
  INTO v_is_superadmin
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_is_superadmin THEN
    RETURN true;
  END IF;

  -- 2. Busca entidade, cargo e ponto focal do usuário
  SELECT 
    COALESCE(p.entidade, p.entidade_nome, ''),
    COALESCE(p.papel, 'visualizador'),
    COALESCE(p.ponto_focal, false)
  INTO 
    v_user_entidade,
    v_user_papel,
    v_user_ponto_focal
  FROM public.profiles p
  WHERE p.id = p_user_id;

  -- Se perfil não possui entidade preenchida, busca no vínculo municipal
  IF v_user_entidade = '' THEN
    SELECT COALESCE(mm.entidade, '')
    INTO v_user_entidade
    FROM public.municipio_membros mm
    WHERE mm.user_id = p_user_id
    LIMIT 1;
  END IF;

  -- 3. Identifica a entidade proprietária da camada em camadas_geograficas
  SELECT COALESCE(
    c.entidade,
    c.metadata->>'entidade',
    'Prefeitura Municipal'
  )
  INTO v_theme_entidade
  FROM public.camadas_geograficas c
  WHERE c.id = p_theme_id
     OR LOWER(TRIM(c.nome)) = LOWER(TRIM(p_theme_id))
  LIMIT 1;

  -- Se não constar na tabela de camadas, tenta inferir de feições existentes
  IF v_theme_entidade IS NULL THEN
    SELECT COALESCE(f.entidade, 'Prefeitura Municipal')
    INTO v_theme_entidade
    FROM public.feicoes f
    WHERE f.theme_id = p_theme_id
    LIMIT 1;
  END IF;

  IF v_theme_entidade IS NULL THEN
    v_theme_entidade := 'Prefeitura Municipal';
  END IF;

  -- 4. Busca registro explícito em permissoes_camada para este usuário e camada
  SELECT 
    true,
    COALESCE(pc.pode_ver, false),
    COALESCE(pc.pode_editar, false),
    COALESCE(pc.pode_excluir, false)
  INTO
    v_has_pc,
    v_pc_ver,
    v_pc_editar,
    v_pc_excluir
  FROM public.permissoes_camada pc
  WHERE pc.user_id = p_user_id
    AND (pc.theme_id = p_theme_id OR LOWER(TRIM(pc.theme_id)) = LOWER(TRIM(p_theme_id)))
  LIMIT 1;

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
  -- Se a camada é de outro ente governamental parceiro:
  -- A concessão concedida pelo administrador na tabela permissoes_camada é SOBERANA!
  -- Se o usuário tem pode_ver = true, ele PODE ver os dados independentemente de
  -- qualquer flag de ponto focal.
  IF v_is_outro_ente THEN
    IF v_has_pc THEN
      IF p_acao = 'ver' THEN RETURN v_pc_ver; END IF;
      IF p_acao = 'editar' THEN RETURN v_pc_editar; END IF;
      IF p_acao = 'excluir' THEN RETURN v_pc_excluir; END IF;
      RETURN false;
    END IF;

    -- Usuário de outro ente sem concessão explícita NUNCA acessa dados de outro órgão
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
  -- camadas não incluídas permanecem restritas
  IF EXISTS (SELECT 1 FROM public.permissoes_camada WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  -- Administrador da própria entidade sem restrições explícitas cadastradas tem acesso total
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

-- 2. Garantia de RLS para permissoes_camada
ALTER TABLE public.permissoes_camada ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ler suas próprias permissões de camada" ON public.permissoes_camada;
CREATE POLICY "Usuários autenticados podem ler suas próprias permissões de camada"
ON public.permissoes_camada FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins podem gerenciar permissoes_camada" ON public.permissoes_camada;
CREATE POLICY "Admins podem gerenciar permissoes_camada"
ON public.permissoes_camada FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3. Garantia de RLS para permissoes_aba
ALTER TABLE public.permissoes_aba ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ler suas próprias permissões de aba" ON public.permissoes_aba;
CREATE POLICY "Usuários autenticados podem ler suas próprias permissões de aba"
ON public.permissoes_aba FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins podem gerenciar permissoes_aba" ON public.permissoes_aba;
CREATE POLICY "Admins podem gerenciar permissoes_aba"
ON public.permissoes_aba FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Garantia de RLS para permissoes_raster
ALTER TABLE public.permissoes_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ler suas próprias permissões de raster" ON public.permissoes_raster;
CREATE POLICY "Usuários autenticados podem ler suas próprias permissões de raster"
ON public.permissoes_raster FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins podem gerenciar permissoes_raster" ON public.permissoes_raster;
CREATE POLICY "Admins podem gerenciar permissoes_raster"
ON public.permissoes_raster FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 5. Atualização da política de SELECT de feições para usar a função tem_permissao corrigida
DROP POLICY IF EXISTS "feicoes_select_isolamento" ON public.feicoes;
CREATE POLICY "feicoes_select_isolamento"
ON public.feicoes FOR SELECT
TO authenticated
USING (
  public.tem_permissao(auth.uid(), theme_id, 'ver')
);

COMMENT ON FUNCTION public.tem_permissao IS 'Valida permissão interinstitucional e municipal sem bloqueios indevidos por flag de ponto focal';
