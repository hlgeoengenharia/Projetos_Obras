-- ============================================================
-- SCRIPT DE LOGIN E PERMISSÕES — FASE 3
-- Execute a PRIMEIRA PARTE no SQL Editor do Supabase agora.
-- A SEGUNDA PARTE (ativação do RLS) fica claramente separada no
-- final — só rode quando estiver pronto para o corte de acesso
-- anônimo (ver seção "ATIVAÇÃO" mais abaixo).
-- ============================================================


-- ============================================================
-- PARTE 1 — TABELAS, GATILHOS E FUNÇÕES (seguro rodar agora)
-- ============================================================

-- --- profiles ------------------------------------------------
-- Estende auth.users. Nunca é inserida pelo cliente — só pelo
-- gatilho abaixo, disparado quando uma conta é criada no Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  organizacao text,
  papel text NOT NULL DEFAULT 'visualizador' CHECK (papel IN ('admin', 'editor', 'visualizador', 'externo')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- E-mail fica duplicado aqui de propósito: o painel de administração
-- (Usuários e Permissões) roda com a chave anônima/autenticada, sem acesso
-- à API admin do Supabase Auth (que exigiria a service role key no cliente,
-- inseguro). Copiar o e-mail pra cá é o jeito seguro de listar usuários.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, papel)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email, 'visualizador');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- --- permissoes_camada ----------------------------------------
-- A grade "usuário X pode ver/editar/excluir a camada Y".
CREATE TABLE IF NOT EXISTS public.permissoes_camada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme_id uuid NOT NULL REFERENCES public.temas(id) ON DELETE CASCADE,
  pode_ver boolean NOT NULL DEFAULT true,
  pode_editar boolean NOT NULL DEFAULT false,
  pode_excluir boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, theme_id)
);

-- --- audit_log --------------------------------------------------
-- Só o gatilho em feicoes escreve aqui. Cliente só lê (admin).
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id),
  tabela text NOT NULL,
  registro_id uuid,
  acao text NOT NULL CHECK (acao IN ('insert', 'update', 'delete')),
  dados_antes jsonb,
  dados_depois jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- --- funções auxiliares de permissão ---------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND papel = 'admin' AND ativo
  );
$$;

-- papel 'externo' nunca passa para 'editar'/'excluir', mesmo que uma
-- permissão tenha sido marcada por engano — reforço redundante de propósito.
CREATE OR REPLACE FUNCTION public.tem_permissao(p_theme_id uuid, p_acao text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin()
    OR EXISTS(
      SELECT 1
      FROM public.permissoes_camada pc
      JOIN public.profiles p ON p.id = pc.user_id
      WHERE pc.user_id = auth.uid()
        AND pc.theme_id = p_theme_id
        AND p.ativo
        AND (p.papel <> 'externo' OR p_acao = 'ver')
        AND CASE p_acao
          WHEN 'ver' THEN pc.pode_ver
          WHEN 'editar' THEN pc.pode_editar
          WHEN 'excluir' THEN pc.pode_excluir
          ELSE false
        END
    );
$$;

-- --- exclusão lógica em feicoes ---------------------------------
ALTER TABLE public.feicoes ADD COLUMN IF NOT EXISTS deletado_em timestamptz;
ALTER TABLE public.feicoes ADD COLUMN IF NOT EXISTS deletado_por uuid REFERENCES public.profiles(id);

-- Distingue "excluir" (mudar deletado_em) de "editar" (qualquer outro campo)
-- e exige a permissão certa para cada caso. DELETE de verdade (SQL DELETE)
-- é tratado à parte, só por RLS (ver PARTE 2) — restrito a admin.
CREATE OR REPLACE FUNCTION public.feicoes_checa_permissao_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.deletado_em IS DISTINCT FROM OLD.deletado_em THEN
    IF NOT public.tem_permissao(OLD.theme_id, 'excluir') THEN
      RAISE EXCEPTION 'Sem permissão para excluir feições deste tema';
    END IF;
    -- uma chamada de exclusão/restauração não deve alterar mais nada junto
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

DROP TRIGGER IF EXISTS trg_feicoes_checa_permissao_update ON public.feicoes;
CREATE TRIGGER trg_feicoes_checa_permissao_update
  BEFORE UPDATE ON public.feicoes
  FOR EACH ROW EXECUTE FUNCTION public.feicoes_checa_permissao_update();

-- --- auditoria em feicoes -----------------------------------------
CREATE OR REPLACE FUNCTION public.feicoes_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_depois)
    VALUES (auth.uid(), 'feicoes', NEW.id, 'insert', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_antes, dados_depois)
    VALUES (
      auth.uid(), 'feicoes', NEW.id,
      CASE WHEN NEW.deletado_em IS DISTINCT FROM OLD.deletado_em AND NEW.deletado_em IS NOT NULL
           THEN 'delete' ELSE 'update' END,
      to_jsonb(OLD), to_jsonb(NEW)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_antes)
    VALUES (auth.uid(), 'feicoes', OLD.id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_feicoes_audit ON public.feicoes;
CREATE TRIGGER trg_feicoes_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.feicoes
  FOR EACH ROW EXECUTE FUNCTION public.feicoes_audit();

-- --- RLS das tabelas NOVAS (seguro ativar agora — nenhum cliente
-- ainda depende de acesso aberto a elas) -----------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissoes_camada ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS permissoes_select_own_or_admin ON public.permissoes_camada;
CREATE POLICY permissoes_select_own_or_admin ON public.permissoes_camada
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS permissoes_insert_admin ON public.permissoes_camada;
CREATE POLICY permissoes_insert_admin ON public.permissoes_camada
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS permissoes_update_admin ON public.permissoes_camada;
CREATE POLICY permissoes_update_admin ON public.permissoes_camada
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS permissoes_delete_admin ON public.permissoes_camada;
CREATE POLICY permissoes_delete_admin ON public.permissoes_camada
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS audit_select_admin ON public.audit_log;
CREATE POLICY audit_select_admin ON public.audit_log
  FOR SELECT USING (public.is_admin());


-- ============================================================
-- PARTE 2 — ATIVAÇÃO DO CONTROLE DE ACESSO
-- SÓ RODE ISTO QUANDO ESTIVER PRONTO PARA O CORTE.
-- A partir daqui, acesso SEM LOGIN deixa de funcionar em
-- feicoes/temas/forms — combine o horário com os usuários atuais.
-- Pré-requisitos antes de rodar:
--   1) Pelo menos um usuário com papel = 'admin' já existe em profiles.
--   2) Esse admin já concedeu permissoes_camada pra quem precisa
--      continuar trabalhando logo após o corte.
-- ============================================================

-- ALTER TABLE public.feicoes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS feicoes_select ON public.feicoes;
-- CREATE POLICY feicoes_select ON public.feicoes
--   FOR SELECT USING ((deletado_em IS NULL OR public.is_admin()) AND public.tem_permissao(theme_id, 'ver'));
--
-- DROP POLICY IF EXISTS feicoes_insert ON public.feicoes;
-- CREATE POLICY feicoes_insert ON public.feicoes
--   FOR INSERT WITH CHECK (public.is_admin() OR public.tem_permissao(theme_id, 'editar'));
--
-- DROP POLICY IF EXISTS feicoes_update ON public.feicoes;
-- CREATE POLICY feicoes_update ON public.feicoes
--   FOR UPDATE
--   USING (public.is_admin() OR public.tem_permissao(theme_id, 'editar') OR public.tem_permissao(theme_id, 'excluir'))
--   WITH CHECK (public.is_admin() OR public.tem_permissao(theme_id, 'editar') OR public.tem_permissao(theme_id, 'excluir'));
--
-- DROP POLICY IF EXISTS feicoes_delete_admin_only ON public.feicoes;
-- CREATE POLICY feicoes_delete_admin_only ON public.feicoes
--   FOR DELETE USING (public.is_admin());
--
-- DROP POLICY IF EXISTS temas_select ON public.temas;
-- CREATE POLICY temas_select ON public.temas
--   FOR SELECT USING (public.is_admin() OR public.tem_permissao(id, 'ver'));
--
-- DROP POLICY IF EXISTS temas_insert_admin ON public.temas;
-- CREATE POLICY temas_insert_admin ON public.temas
--   FOR INSERT WITH CHECK (public.is_admin());
--
-- DROP POLICY IF EXISTS temas_update_admin ON public.temas;
-- CREATE POLICY temas_update_admin ON public.temas
--   FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
--
-- DROP POLICY IF EXISTS temas_delete_admin ON public.temas;
-- CREATE POLICY temas_delete_admin ON public.temas
--   FOR DELETE USING (public.is_admin());
--
-- DROP POLICY IF EXISTS forms_select_authenticated ON public.forms;
-- CREATE POLICY forms_select_authenticated ON public.forms
--   FOR SELECT USING (auth.uid() IS NOT NULL);
--
-- DROP POLICY IF EXISTS forms_insert_admin ON public.forms;
-- CREATE POLICY forms_insert_admin ON public.forms
--   FOR INSERT WITH CHECK (public.is_admin());
--
-- DROP POLICY IF EXISTS forms_update_admin ON public.forms;
-- CREATE POLICY forms_update_admin ON public.forms
--   FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());
--
-- DROP POLICY IF EXISTS forms_delete_admin ON public.forms;
-- CREATE POLICY forms_delete_admin ON public.forms
--   FOR DELETE USING (public.is_admin());
--
-- Observação: get_features_bbox() e get_tile() são funções SQL comuns
-- (SECURITY INVOKER por padrão) — assim que o RLS acima for ativado,
-- elas passam a respeitar as mesmas políticas de feicoes automaticamente,
-- sem precisar de nenhuma alteração.
