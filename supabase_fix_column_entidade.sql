-- ====================================================================
-- CORREÇÃO DO ERRO: column t.entidade does not exist
-- Execute este script no SQL Editor do seu Supabase Dashboard.
-- ====================================================================

-- 1. Garante que a coluna entidade exista na tabela temas (evita falhas de schema)
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS entidade text;

-- 2. Atualiza a função tem_permissao para ler a entidade do JSONB metadata com segurança
CREATE OR REPLACE FUNCTION public.tem_permissao(p_theme_id uuid, p_acao text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  SELECT public.is_super_admin() INTO v_is_super;
  IF v_is_super THEN
    RETURN true;
  END IF;

  -- 2. Busca dados do tema (lendo de metadata->>'entidade' de forma segura)
  SELECT 
    t.municipio_id,
    COALESCE(NULLIF(t.metadata->>'entidade', ''), 'Prefeitura Municipal')
  INTO v_theme_mun_id, v_theme_entidade
  FROM public.temas t
  WHERE t.id = p_theme_id;

  IF v_theme_mun_id IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Busca vínculo do usuário no município
  SELECT 
    mm.papel,
    COALESCE(mm.entidade, p.entidade, 'Prefeitura Municipal'),
    COALESCE(p.ponto_focal, false)
  INTO v_user_papel, v_user_entidade, v_user_ponto_focal
  FROM public.municipio_membros mm
  JOIN public.profiles p ON p.id = mm.user_id
  WHERE mm.user_id = auth.uid()
    AND mm.municipio_id = v_theme_mun_id
    AND mm.status = 'aprovado'
    AND p.ativo
  LIMIT 1;

  IF v_user_papel IS NULL THEN
    RETURN false;
  END IF;

  -- 4. Busca regras específicas em permissoes_camada
  SELECT 
    true,
    COALESCE(pc.pode_ver, false),
    COALESCE(pc.pode_editar, false),
    COALESCE(pc.pode_excluir, false)
  INTO v_has_pc, v_pc_ver, v_pc_editar, v_pc_excluir
  FROM public.permissoes_camada pc
  WHERE pc.user_id = auth.uid()
    AND pc.theme_id = p_theme_id;

  v_has_pc := COALESCE(v_has_pc, false);

  -- 5. Avalia se a camada pertence a OUTRO ENTE (interinstitucional)
  v_is_outro_ente := (
    LOWER(TRIM(v_theme_entidade)) <> 'geral'
    AND LOWER(TRIM(v_theme_entidade)) <> LOWER(TRIM(v_user_entidade))
    AND NOT (
      (v_theme_entidade ILIKE '%prefeitura%' OR v_theme_entidade ILIKE '%municip%')
      AND (v_user_entidade ILIKE '%prefeitura%' OR v_user_entidade ILIKE '%municip%')
    )
  );

  IF v_is_outro_ente THEN
    -- REGRA DE OURO: Para camadas de outro ente, o usuário DEVE ser Ponto Focal
    -- e ter autorização EXPLÍCITA em permissoes_camada.
    -- O papel corporativo 'admin' do órgão dele NÃO se aplica à camada de outro ente!
    IF NOT v_user_ponto_focal OR NOT v_has_pc THEN
      RETURN false;
    END IF;

    IF p_acao = 'ver' THEN RETURN v_pc_ver; END IF;
    IF p_acao = 'editar' THEN RETURN v_pc_editar; END IF;
    IF p_acao = 'excluir' THEN RETURN v_pc_excluir; END IF;
    RETURN false;
  END IF;

  -- 6. Camada da PRÓPRIA entidade:
  -- Regra explícita em permissoes_camada é SOBERANA (vale sobre qualquer papel)
  IF v_has_pc THEN
    IF p_acao = 'ver' THEN RETURN v_pc_ver; END IF;
    IF p_acao = 'editar' THEN RETURN v_pc_editar; END IF;
    IF p_acao = 'excluir' THEN RETURN v_pc_excluir; END IF;
    RETURN false;
  END IF;

  -- Administrador da própria entidade sem restrições explícitas cadastradas
  IF v_user_papel = 'admin' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
