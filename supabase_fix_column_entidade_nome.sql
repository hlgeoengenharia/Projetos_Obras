-- ==============================================================================
-- CORREÇÃO IMEDIATA DO ERRO: column p.entidade_nome does not exist
-- Execute este script no SQL Editor do seu Supabase Dashboard (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. Cria a coluna entidade_nome na tabela profiles caso não exista (elimina o erro imediatamente)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS entidade_nome text;

-- 2. Atualiza a função tem_permissao no banco removendo referências a colunas inexistentes
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

  -- 3. Busca entidade e perfil do usuário (usando p.entidade com segurança)
  SELECT 
    COALESCE(NULLIF(p.entidade, ''), ''),
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

  -- Se houver registro explícito em permissoes_camada, a regra explícita tem prioridade máxima
  IF v_has_pc THEN
    IF p_acao = 'excluir' THEN
      RETURN v_pc_excluir;
    ELSIF p_acao = 'editar' THEN
      RETURN v_pc_editar;
    ELSE
      RETURN v_pc_ver;
    END IF;
  END IF;

  -- 5. Avalia se a camada pertence a OUTRO ENTE (interinstitucional)
  v_is_outro_ente := (
    LOWER(TRIM(v_theme_entidade)) <> 'geral'
    AND LOWER(TRIM(v_theme_entidade)) <> 'pública'
    AND LOWER(TRIM(v_theme_entidade)) <> 'publica'
    AND LOWER(TRIM(v_theme_entidade)) <> LOWER(TRIM(v_user_entidade))
    AND NOT (
      (v_theme_entidade ILIKE '%prefeitura%' OR v_theme_entidade ILIKE '%municip%')
      AND (v_user_entidade ILIKE '%prefeitura%' OR v_user_entidade ILIKE '%municip%')
    )
  );

  -- Se a camada é de OUTRO ENTE e NÃO houve concessão pontual em permissoes_camada: BLOQUEIO TOTAL
  IF v_is_outro_ente THEN
    RETURN false;
  END IF;

  -- 6. Camada da PRÓPRIA ENTIDADE do usuário:
  IF EXISTS (SELECT 1 FROM public.permissoes_camada WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  IF v_user_papel = 'admin' THEN
    RETURN true;
  END IF;

  IF p_acao = 'ver' THEN
    RETURN true;
  END IF;

  IF p_acao = 'editar' AND v_user_papel = 'editor' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
