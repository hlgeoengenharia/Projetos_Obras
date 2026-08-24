-- ============================================================
-- CORREÇÃO: 500 (Internal Server Error / 42P17) ao salvar permissão por
-- aba ou por camada
-- Execute no SQL Editor do Supabase, DEPOIS de supabase_ceiling_fix.sql.
-- ============================================================
-- 42P17 = "infinite recursion detected in policy" — as políticas do teto
-- ("quem vê mais pode ver menos...") consultavam permissoes_aba/
-- permissoes_camada de DENTRO da própria política dessas tabelas, pra
-- saber se o admin de ente já tinha aquela permissão. O Postgres recusa
-- isso de cara, mesmo quando o caminho realmente termina (aqui terminava,
-- mas ele não analisa a fundo, só vê a tabela se referenciando e bloqueia).
--
-- Correção: mover essa checagem pra dentro de uma função SECURITY DEFINER
-- — assim como is_super_admin()/is_municipio_admin()/is_entidade_admin_for()
-- já fazem. Uma função SECURITY DEFINER ignora o RLS na consulta que roda
-- dentro dela, então a política não "vê" a tabela se referenciando de
-- novo — o ciclo é quebrado ali.

CREATE OR REPLACE FUNCTION public.eu_posso_ver_aba(p_form_id uuid, p_tab_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.permissoes_aba
    WHERE user_id = auth.uid() AND form_id = p_form_id AND tab_id = p_tab_id AND pode_ver
  );
$$;

CREATE OR REPLACE FUNCTION public.eu_posso_editar_aba(p_form_id uuid, p_tab_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.permissoes_aba
    WHERE user_id = auth.uid() AND form_id = p_form_id AND tab_id = p_tab_id AND pode_editar
  );
$$;

CREATE OR REPLACE FUNCTION public.eu_posso_ver_camada(p_theme_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.permissoes_camada WHERE user_id = auth.uid() AND theme_id = p_theme_id AND pode_ver);
$$;

CREATE OR REPLACE FUNCTION public.eu_posso_editar_camada(p_theme_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.permissoes_camada WHERE user_id = auth.uid() AND theme_id = p_theme_id AND pode_editar);
$$;

CREATE OR REPLACE FUNCTION public.eu_posso_excluir_camada(p_theme_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.permissoes_camada WHERE user_id = auth.uid() AND theme_id = p_theme_id AND pode_excluir);
$$;

-- --- permissoes_aba: mesmas regras de antes, agora sem auto-referência ---
DROP POLICY IF EXISTS permissoes_aba_insert_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_insert_admin ON public.permissoes_aba
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_aba.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_aba.pode_ver OR public.eu_posso_ver_aba(permissoes_aba.form_id, permissoes_aba.tab_id))
      AND (NOT permissoes_aba.pode_editar OR public.eu_posso_editar_aba(permissoes_aba.form_id, permissoes_aba.tab_id))
    )
  );

DROP POLICY IF EXISTS permissoes_aba_update_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_update_admin ON public.permissoes_aba
  FOR UPDATE USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = permissoes_aba.user_id
        AND public.is_entidade_admin_for(mm.entidade)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_aba.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_aba.pode_ver OR public.eu_posso_ver_aba(permissoes_aba.form_id, permissoes_aba.tab_id))
      AND (NOT permissoes_aba.pode_editar OR public.eu_posso_editar_aba(permissoes_aba.form_id, permissoes_aba.tab_id))
    )
  );

-- --- permissoes_camada: idem ------------------------------------------
DROP POLICY IF EXISTS permissoes_insert_admin ON public.permissoes_camada;
CREATE POLICY permissoes_insert_admin ON public.permissoes_camada
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_camada.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_camada.pode_ver OR public.eu_posso_ver_camada(permissoes_camada.theme_id))
      AND (NOT permissoes_camada.pode_editar OR public.eu_posso_editar_camada(permissoes_camada.theme_id))
      AND (NOT permissoes_camada.pode_excluir OR public.eu_posso_excluir_camada(permissoes_camada.theme_id))
    )
  );

DROP POLICY IF EXISTS permissoes_update_admin ON public.permissoes_camada;
CREATE POLICY permissoes_update_admin ON public.permissoes_camada
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = permissoes_camada.user_id
        AND public.is_entidade_admin_for(mm.entidade)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_camada.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_camada.pode_ver OR public.eu_posso_ver_camada(permissoes_camada.theme_id))
      AND (NOT permissoes_camada.pode_editar OR public.eu_posso_editar_camada(permissoes_camada.theme_id))
      AND (NOT permissoes_camada.pode_excluir OR public.eu_posso_excluir_camada(permissoes_camada.theme_id))
    )
  );
