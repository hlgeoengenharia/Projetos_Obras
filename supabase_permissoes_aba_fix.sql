-- ============================================================
-- PERMISSÃO POR ABA DE FORMULÁRIO (ver / editar)
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- permissoes_camada já controla ver/editar/excluir por CAMADA (tema)
-- inteira — é o que o RLS/gatilho de feicoes usa de verdade pra liberar
-- ou negar uma linha. O que falta é granularidade DENTRO da camada: um
-- formulário dinâmico tem várias abas (seções de campos), e a ideia agora
-- é poder esconder abas inteiras de um usuário (ex: alguém do MPF só
-- enxerga a aba "Dados Gerais", não "Financeiro").
--
-- Isso não é segurança de linha (a feição continua sendo UMA linha no
-- banco, com todas as abas juntas no mesmo JSON de propriedades) — é
-- controle de UI: o renderizador do formulário (src/formRenderer.js) só
-- desenha a aba se existir uma linha AQUI autorizando com pode_ver=true.
-- Negado por padrão: super_admin e admin de município sempre veem tudo,
-- sem precisar de linha nenhuma; qualquer outro papel não vê NADA até
-- alguém autorizar explicitamente aba por aba — inclusive uma aba nova
-- criada depois dentro de um formulário que a pessoa já tinha acesso a
-- outras abas, ou um formulário novo associado a uma camada nova. Nada
-- aparece sozinho; é sempre um ato deliberado de quem aprova.

CREATE TABLE IF NOT EXISTS public.permissoes_aba (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  tab_id text NOT NULL,
  pode_ver boolean NOT NULL DEFAULT false,
  pode_editar boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, form_id, tab_id)
);

ALTER TABLE public.permissoes_aba ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_aba_select_own_or_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_select_own_or_admin ON public.permissoes_aba
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
  );

DROP POLICY IF EXISTS permissoes_aba_insert_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_insert_admin ON public.permissoes_aba
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
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
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
  );

DROP POLICY IF EXISTS permissoes_aba_delete_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_delete_admin ON public.permissoes_aba
  FOR DELETE USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
  );
