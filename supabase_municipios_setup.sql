-- ============================================================
-- SCRIPT DE MULTI-TENANT POR MUNICÍPIO — FASE 3b
-- Execute no SQL Editor do Supabase depois de supabase_auth_setup.sql
-- (Parte 1). Não altera aquele script — só redefine (CREATE OR REPLACE)
-- as funções que ele já criou, então a Parte 2 dele (ainda comentada,
-- ativação do RLS de feicoes/temas/forms) continua valendo sem precisar
-- editar o texto: tem_permissao()/is_admin() é que passam a entender
-- município por baixo dos panos.
-- ============================================================

-- --- municipios ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.municipios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  uf text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.municipios ENABLE ROW LEVEL SECURITY;

-- Leitura pública de propósito: a tela de cadastro (signup.html) precisa
-- listar os municípios ANTES de existir sessão (é aí que a pessoa escolhe
-- qual vai solicitar acesso). Não é dado sensível, só nome/UF.
DROP POLICY IF EXISTS municipios_select_authenticated ON public.municipios;
DROP POLICY IF EXISTS municipios_select_public ON public.municipios;
CREATE POLICY municipios_select_public ON public.municipios
  FOR SELECT USING (true);

-- --- municipio_membros -------------------------------------------
-- Uma linha por (usuário, município): é o pedido de acesso (status
-- pendente, com entidade/cargo informados no cadastro) e, depois de
-- aprovado, o vínculo com o papel dentro daquele município.
CREATE TABLE IF NOT EXISTS public.municipio_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  municipio_id uuid NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'visualizador' CHECK (papel IN ('admin', 'editor', 'visualizador', 'externo')),
  entidade text,
  cargo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por uuid REFERENCES public.profiles(id),
  UNIQUE(user_id, municipio_id)
);

-- --- profiles ganha a flag de administrador geral da plataforma ---
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS super_admin boolean NOT NULL DEFAULT false;

-- --- temas e forms passam a pertencer a um município ---------------
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS municipio_id uuid REFERENCES public.municipios(id);
ALTER TABLE public.forms ADD COLUMN IF NOT EXISTS municipio_id uuid REFERENCES public.municipios(id);

-- Migração: cria "Cabedelo" (se ainda não existir) e associa a ele tudo
-- que já estava cadastrado antes deste script existir.
DO $$
DECLARE
  v_cabedelo_id uuid;
BEGIN
  SELECT id INTO v_cabedelo_id FROM public.municipios WHERE nome = 'Cabedelo' LIMIT 1;
  IF v_cabedelo_id IS NULL THEN
    INSERT INTO public.municipios (nome, uf) VALUES ('Cabedelo', 'PB') RETURNING id INTO v_cabedelo_id;
  END IF;

  UPDATE public.temas SET municipio_id = v_cabedelo_id WHERE municipio_id IS NULL;
  UPDATE public.forms SET municipio_id = v_cabedelo_id WHERE municipio_id IS NULL;
END $$;

ALTER TABLE public.temas ALTER COLUMN municipio_id SET NOT NULL;
ALTER TABLE public.forms ALTER COLUMN municipio_id SET NOT NULL;

-- --- funções de permissão, redefinidas para município ---------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND super_admin AND ativo
  );
$$;

-- is_admin() era o "administrador" único e global da fase anterior.
-- Agora esse conceito é o super_admin da plataforma — "admin" por
-- município é outra coisa (is_municipio_admin). Mantido com o mesmo nome
-- só pra não precisar reescrever as políticas que já o referenciam
-- (profiles, audit_log, e a Parte 2 ainda comentada de feicoes/temas/forms).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin();
$$;

CREATE OR REPLACE FUNCTION public.is_municipio_admin(p_municipio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS(
      SELECT 1
      FROM public.municipio_membros mm
      JOIN public.profiles p ON p.id = mm.user_id
      WHERE mm.user_id = auth.uid()
        AND mm.municipio_id = p_municipio_id
        AND mm.papel = 'admin'
        AND mm.status = 'aprovado'
        AND p.ativo
    );
$$;

-- Agora resolve o município do tema e exige vínculo aprovado nele.
-- 'admin' do município libera tudo (exceto exclusão física, que
-- continua exclusiva do super_admin via RLS). Os demais papéis caem na
-- checagem fina de permissoes_camada, exatamente como antes — essa
-- tabela não muda, ela é o ajuste por tema dentro de um município.
CREATE OR REPLACE FUNCTION public.tem_permissao(p_theme_id uuid, p_acao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS(
      SELECT 1
      FROM public.temas t
      JOIN public.municipio_membros mm ON mm.municipio_id = t.municipio_id
      JOIN public.profiles p ON p.id = mm.user_id
      LEFT JOIN public.permissoes_camada pc ON pc.user_id = mm.user_id AND pc.theme_id = t.id
      WHERE t.id = p_theme_id
        AND mm.user_id = auth.uid()
        AND mm.status = 'aprovado'
        AND p.ativo
        AND (
          mm.papel = 'admin'
          OR (
            (mm.papel <> 'externo' OR p_acao = 'ver')
            AND CASE p_acao
              WHEN 'ver' THEN COALESCE(pc.pode_ver, false)
              WHEN 'editar' THEN COALESCE(pc.pode_editar, false)
              WHEN 'excluir' THEN COALESCE(pc.pode_excluir, false)
              ELSE false
            END
          )
        )
    );
$$;

-- Gatilho de edição/exclusão lógica de feicoes: agora chama tem_permissao()
-- diretamente (que já resolve super_admin/admin de município/permissão
-- fina por igual) em vez de ter um atalho de is_admin() separado.
CREATE OR REPLACE FUNCTION public.feicoes_checa_permissao_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deletado_em IS DISTINCT FROM OLD.deletado_em THEN
    IF NOT public.tem_permissao(OLD.theme_id, 'excluir') THEN
      RAISE EXCEPTION 'Sem permissão para excluir feições deste tema';
    END IF;
    NEW.propriedades := OLD.propriedades;
    NEW.geometria := OLD.geometria;
    NEW.theme_id := OLD.theme_id;
    NEW.deletado_por := CASE WHEN NEW.deletado_em IS NOT NULL THEN auth.uid() ELSE NULL END;
  ELSE
    IF NOT public.tem_permissao(OLD.theme_id, 'editar') THEN
      RAISE EXCEPTION 'Sem permissão para editar feições deste tema';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- --- permissoes_camada: admin de MUNICÍPIO também gerencia (não só super_admin) ---
DROP POLICY IF EXISTS permissoes_insert_admin ON public.permissoes_camada;
CREATE POLICY permissoes_insert_admin ON public.permissoes_camada
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
  );

DROP POLICY IF EXISTS permissoes_update_admin ON public.permissoes_camada;
CREATE POLICY permissoes_update_admin ON public.permissoes_camada
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
  ) WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
  );

DROP POLICY IF EXISTS permissoes_delete_admin ON public.permissoes_camada;
CREATE POLICY permissoes_delete_admin ON public.permissoes_camada
  FOR DELETE USING (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
  );

-- --- RLS de municipio_membros ---------------------------------------
ALTER TABLE public.municipio_membros ENABLE ROW LEVEL SECURITY;

-- Vê o próprio pedido/vínculo, ou tudo se for super_admin / admin
-- daquele município específico (precisa enxergar quem já é membro e
-- quem está pedindo acesso).
DROP POLICY IF EXISTS membros_select ON public.municipio_membros;
CREATE POLICY membros_select ON public.municipio_membros
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  );

-- Autocadastro: só a própria solicitação, sempre pendente e sempre
-- como visualizador — ninguém se autopromove a admin/editor/externo.
-- Admin (geral ou do município) também pode inserir direto (ex: adicionar
-- alguém manualmente já aprovado).
DROP POLICY IF EXISTS membros_insert_self_or_admin ON public.municipio_membros;
CREATE POLICY membros_insert_self_or_admin ON public.municipio_membros
  FOR INSERT WITH CHECK (
    (user_id = auth.uid() AND status = 'pendente' AND papel = 'visualizador')
    OR public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  );

DROP POLICY IF EXISTS membros_update_admin ON public.municipio_membros;
CREATE POLICY membros_update_admin ON public.municipio_membros
  FOR UPDATE USING (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  ) WITH CHECK (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  );

DROP POLICY IF EXISTS membros_delete_admin ON public.municipio_membros;
CREATE POLICY membros_delete_admin ON public.municipio_membros
  FOR DELETE USING (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  );

-- ============================================================
-- ATUALIZAÇÃO DA PARTE 2 (ainda comentada) DE supabase_auth_setup.sql
-- ============================================================
-- feicoes_select/insert/update/delete e temas_select não precisam mudar —
-- passam por tem_permissao()/is_admin(), que já foram redefinidas acima
-- pra entender município. MAS temas_insert_admin/temas_update_admin/
-- temas_delete_admin e todas as políticas de forms daquele script usavam
-- is_admin() sozinho (sem passar por tem_permissao), e agora is_admin()
-- só é true pro super_admin — um admin de MUNICÍPIO ficaria sem conseguir
-- criar/editar tema ou formulário no próprio município. Quando for ativar
-- a Parte 2, troque essas 6 políticas por estas (mesmo nome, texto novo):
--
-- DROP POLICY IF EXISTS temas_insert_admin ON public.temas;
-- CREATE POLICY temas_insert_admin ON public.temas
--   FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS temas_update_admin ON public.temas;
-- CREATE POLICY temas_update_admin ON public.temas
--   FOR UPDATE USING (public.is_super_admin() OR public.is_municipio_admin(municipio_id))
--   WITH CHECK (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS temas_delete_admin ON public.temas;
-- CREATE POLICY temas_delete_admin ON public.temas
--   FOR DELETE USING (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS forms_select_authenticated ON public.forms;
-- CREATE POLICY forms_select_authenticated ON public.forms
--   FOR SELECT USING (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS forms_insert_admin ON public.forms;
-- CREATE POLICY forms_insert_admin ON public.forms
--   FOR INSERT WITH CHECK (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS forms_update_admin ON public.forms;
-- CREATE POLICY forms_update_admin ON public.forms
--   FOR UPDATE USING (public.is_super_admin() OR public.is_municipio_admin(municipio_id))
--   WITH CHECK (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- DROP POLICY IF EXISTS forms_delete_admin ON public.forms;
-- CREATE POLICY forms_delete_admin ON public.forms
--   FOR DELETE USING (public.is_super_admin() OR public.is_municipio_admin(municipio_id));
--
-- (forms_select_authenticated também mudou de propósito: antes qualquer
-- logado via qualquer formulário; agora só quem administra aquele
-- município específico — os DEMAIS usuários do município continuam
-- enxergando os formulários normalmente através dos temas que os usam,
-- via tem_permissao(), não precisam de acesso direto à tabela forms.)

-- ============================================================
-- BOOTSTRAP — rode uma vez, manualmente, pra sua própria conta:
--
--   UPDATE public.profiles SET super_admin = true WHERE email = 'SEU_EMAIL_AQUI';
--
-- Isso dá acesso a tudo, em todos os municípios, sem precisar de
-- nenhuma linha em municipio_membros.
-- ============================================================
