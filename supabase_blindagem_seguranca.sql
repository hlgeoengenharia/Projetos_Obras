-- ==============================================================================
-- SCRIPT DE BLINDAGEM E CORREÇÃO DE VULNERABILIDADES NO SUPABASE (POSTGRESQL)
-- Arquivo: supabase_blindagem_seguranca.sql
-- Execução: Cole e execute no SQL Editor do painel Supabase.
-- ==============================================================================

-- 1. PROTEÇÃO CONTRA ESCALADA DE PRIVILÉGIOS EM public.profiles (P0)
-- Impede que qualquer usuário comum se auto-promova a super_admin, altere seu papel
-- ou reative contas desativadas ao atualizar seus próprios dados de perfil.
CREATE OR REPLACE FUNCTION public.check_profiles_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se a alteração não estiver sendo feita por um super_admin
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    -- Bloqueia alteração indevida de super_admin
    IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
      RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar o privilégio super_admin.';
    END IF;

    -- Bloqueia alteração indevida de papel
    IF NEW.papel IS DISTINCT FROM OLD.papel THEN
      RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar o seu papel institucional.';
    END IF;

    -- Bloqueia alteração indevida de entidade_admin
    IF NEW.entidade_admin IS DISTINCT FROM OLD.entidade_admin THEN
      RAISE EXCEPTION 'Acesso negado: Você não possui permissão para alterar a função de administrador de entidade.';
    END IF;

    -- Bloqueia reativação de conta
    IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      RAISE EXCEPTION 'Acesso negado: Você não possui permissão para modificar o status de ativação da conta.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profiles_privilege_escalation();


-- 2. REVOGAÇÃO DE PERMISSÕES ANÔNIMAS EM FUNÇÕES DELETORAS E DISPARADORAS (P1)
-- Funções de exclusão de dados e disparo de e-mails nunca devem ser executadas por 'anon'.
REVOKE ALL ON FUNCTION public.delete_feicoes_batch(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_feicoes_batch(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_feicoes_batch(uuid, int) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p 
    JOIN pg_namespace n ON n.oid = p.pronamespace 
    WHERE n.nspname = 'public' AND p.proname = 'send_login_alert'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.send_login_alert(text, text, text) FROM PUBLIC;';
    EXECUTE 'REVOKE ALL ON FUNCTION public.send_login_alert(text, text, text) FROM anon;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.send_login_alert(text, text, text) TO authenticated;';
  END IF;
END $$;


-- 3. GARANTIA DE RLS E POLÍTICAS DE ACESSO PARA public.temas E public.forms (P1)
ALTER TABLE public.temas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- Leitura: Qualquer usuário autenticado pode listar temas para visualização
DROP POLICY IF EXISTS temas_select_auth ON public.temas;
CREATE POLICY temas_select_auth ON public.temas
  FOR SELECT TO authenticated
  USING (true);

-- Escrita (INSERT, UPDATE, DELETE): Somente SuperAdmin ou Admin do Município correspondente
DROP POLICY IF EXISTS temas_write_admin ON public.temas;
CREATE POLICY temas_write_admin ON public.temas
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  );

-- Forms: Leitura liberada para usuários autenticados
DROP POLICY IF EXISTS forms_select_auth ON public.forms;
CREATE POLICY forms_select_auth ON public.forms
  FOR SELECT TO authenticated
  USING (true);

-- Forms: Escrita restrita ao SuperAdmin ou Admin do Município
DROP POLICY IF EXISTS forms_write_admin ON public.forms;
CREATE POLICY forms_write_admin ON public.forms
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
  );


-- 4. POLÍTICA DE INSERÇÃO EM public.feicoes (P2)
-- Garante que o usuário só consiga inserir feições em camadas para as quais tenha permissão de editar
DROP POLICY IF EXISTS feicoes_insert_perm ON public.feicoes;
CREATE POLICY feicoes_insert_perm ON public.feicoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.tem_permissao(theme_id, 'editar')
  );


-- 5. BLINDAGEM DA PESQUISA INTERINSTITUCIONAL CONTRA VAZAMENTO DE SIGILO (P1)
-- Quando tem_acesso for falso, mascara o valor_localizado e o resumo do imóvel/processo.
CREATE OR REPLACE FUNCTION public.pesquisar_registro_interinstitucional(
    p_termo text,
    p_tipo text DEFAULT 'todos'
)
RETURNS TABLE (
    feature_id uuid,
    theme_id uuid,
    theme_nome text,
    municipio_id uuid,
    municipio_nome text,
    municipio_uf text,
    campo_label text,
    tipo_registro text,
    valor_localizado text,
    resumo text,
    tem_acesso boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_term text;
    v_digits text;
    v_tipo_alvo text;
    v_user_id uuid;
    v_is_super boolean;
BEGIN
    v_clean_term := lower(trim(coalesce(p_termo, '')));
    v_digits := regexp_replace(coalesce(p_termo, ''), '\D', '', 'g');
    v_tipo_alvo := lower(trim(coalesce(p_tipo, 'todos')));
    v_user_id := auth.uid();

    IF v_clean_term = '' AND v_digits = '' THEN
        RETURN;
    END IF;

    -- Verifica se o usuário atual é SuperAdmin
    SELECT COALESCE(p.super_admin, false) INTO v_is_super
    FROM public.profiles p
    WHERE p.id = v_user_id;
    v_is_super := COALESCE(v_is_super, false);

    RETURN QUERY
    WITH 
    -- ETAPA 1A: Formulários que contêm os campos do tipo de registro desejado
    target_forms AS (
        SELECT id AS form_id
        FROM public.forms
        WHERE (
            v_tipo_alvo = 'todos'
            OR (v_tipo_alvo = 'ipl' AND schema::text ~* '(ipl|inquerito|inquérito|processo|autos|judicial)')
            OR (v_tipo_alvo = 'epol' AND schema::text ~* '(epol|policia federal|dpf)')
            OR (v_tipo_alvo = 'rip' AND schema::text ~* '(rip|spu|patrimonio|patrimônio|uniao|união)')
        )
    ),
    -- ETAPA 1B: Camadas (temas) vinculadas a esses formulários ou identificadas pelo tipo/nome
    target_themes AS (
        SELECT 
            t.id AS theme_id, 
            t.nome AS theme_nome, 
            t.municipio_id
        FROM public.temas t
        WHERE (
            -- Vinculado a formulário com os campos do ente
            EXISTS (
                SELECT 1 FROM target_forms tf 
                WHERE tf.form_id::text = t.tipo_cadastro::text 
                   OR tf.form_id::text = (t.metadata->>'formId')
                   OR tf.form_id::text = (t.metadata->>'tipo_cadastro')
                   OR tf.form_id::text = (t.metadata->>'form_id')
            )
            OR
            -- Identificado diretamente pelo nome da camada
            (v_tipo_alvo = 'ipl' AND t.nome ~* '(ipl|inquerito|inquérito|processo|autos|mpf|justica|justiça|orla)')
            OR (v_tipo_alvo = 'epol' AND t.nome ~* '(epol|policia|polícia|federal|dpf)')
            OR (v_tipo_alvo = 'rip' AND t.nome ~* '(rip|spu|patrimonio|patrimônio|uniao|união|imovel|imóvel)')
            OR (v_tipo_alvo = 'todos')
        )
    ),
    -- ETAPA 2A: Pré-filtragem instantânea de feições apenas nas camadas alvo (Sem timeout)
    candidate_features AS (
        SELECT 
            f.id AS feat_id,
            f.theme_id AS feat_theme_id,
            f.propriedades AS feat_props,
            tt.theme_nome AS t_nome,
            tt.municipio_id AS t_mun_id,
            (v_is_super OR CASE WHEN to_regproc('public.tem_permissao(uuid, text)') IS NOT NULL THEN public.tem_permissao(f.theme_id, 'ver') ELSE true END) AS has_perm,
            COALESCE(
                NULLIF(trim(f.propriedades->>'nome'), ''),
                NULLIF(trim(f.propriedades->>'proprietario'), ''),
                NULLIF(trim(f.propriedades->>'denominacao'), ''),
                NULLIF(trim(f.propriedades->>'imovel'), ''),
                NULLIF(trim(f.propriedades->>'endereco'), ''),
                'Feição Cartográfica Cadastrada'
            ) AS feat_resumo
        FROM public.feicoes f
        JOIN target_themes tt ON tt.theme_id = f.theme_id
        WHERE (
            f.propriedades::text ILIKE ('%' || v_clean_term || '%')
            OR (length(v_digits) >= 6 AND f.propriedades::text ILIKE ('%' || v_digits || '%'))
            OR (length(v_digits) >= 7 AND f.propriedades::text ILIKE ('%' || substring(v_digits from 1 for 7) || '%'))
        )
        LIMIT 200
    ),
    -- ETAPA 2B: Descompactação das propriedades apenas das feições candidatas pré-selecionadas
    matching_props AS (
        SELECT 
            cf.feat_id,
            cf.feat_theme_id,
            cf.t_nome,
            cf.t_mun_id,
            m.nome AS m_nome,
            COALESCE(m.uf, 'PB') AS m_uf,
            kv.key AS p_key,
            kv.value AS p_val,
            regexp_replace(kv.value, '\D', '', 'g') AS p_digits,
            cf.has_perm,
            cf.feat_resumo
        FROM candidate_features cf
        LEFT JOIN public.municipios m ON m.id = cf.t_mun_id
        CROSS JOIN LATERAL jsonb_each_text(
            CASE 
                WHEN jsonb_typeof(cf.feat_props) = 'object' THEN cf.feat_props 
                ELSE '{}'::jsonb 
            END
        ) kv
        WHERE kv.key NOT LIKE '_%' AND kv.key NOT IN ('themeId', 'id_banco', 'geometry')
          AND kv.value IS NOT NULL 
          AND kv.value <> ''
          AND (
              lower(kv.value) LIKE ('%' || v_clean_term || '%')
              OR (
                  length(v_digits) >= 3 
                  AND (
                      regexp_replace(kv.value, '\D', '', 'g') = v_digits
                      OR (length(v_digits) >= 5 AND regexp_replace(kv.value, '\D', '', 'g') LIKE ('%' || v_digits || '%'))
                  )
              )
          )
    ),
    categorized AS (
        SELECT 
            mp.feat_id,
            mp.feat_theme_id,
            mp.t_nome,
            mp.t_mun_id,
            mp.m_nome,
            mp.m_uf,
            mp.p_key,
            CASE 
                WHEN length(mp.p_digits) = 20 OR lower(mp.p_key) LIKE '%ipl%' OR lower(mp.p_key) LIKE '%inquerito%' OR lower(mp.p_key) LIKE '%processo%' OR lower(mp.p_key) LIKE '%autos%' THEN 'ipl'
                WHEN lower(mp.p_key) LIKE '%epol%' OR (length(mp.p_digits) = 11 AND mp.p_val LIKE '%.%') THEN 'epol'
                WHEN lower(mp.p_key) LIKE '%rip%' OR (length(mp.p_digits) BETWEEN 8 AND 13 AND (lower(mp.p_key) LIKE '%imovel%' OR lower(mp.p_key) LIKE '%patrimonio%' OR lower(mp.p_key) LIKE '%spu%')) THEN 'rip'
                ELSE 'geral'
            END AS inferred_type,
            mp.p_val,
            mp.feat_resumo,
            mp.has_perm
        FROM matching_props mp
    )
    SELECT DISTINCT ON (c.feat_id)
        c.feat_id AS feature_id,
        c.feat_theme_id AS theme_id,
        COALESCE(c.t_nome, 'Camada Sem Nome') AS theme_nome,
        c.t_mun_id AS municipio_id,
        COALESCE(c.m_nome, 'Município Não Identificado') AS municipio_nome,
        c.m_uf AS municipio_uf,
        c.p_key AS campo_label,
        c.inferred_type AS tipo_registro,
        CASE 
            WHEN c.has_perm THEN c.p_val 
            ELSE '*** REGISTRO SOB SIGILO ***' 
        END AS valor_localizado,
        CASE 
            WHEN c.has_perm THEN c.feat_resumo 
            ELSE 'Dados cadastrais sob sigilo institucional' 
        END AS resumo,
        c.has_perm AS tem_acesso
    FROM categorized c
    WHERE (
        v_tipo_alvo = 'todos'
        OR (v_tipo_alvo = 'ipl' AND c.inferred_type = 'ipl')
        OR (v_tipo_alvo = 'epol' AND c.inferred_type = 'epol')
        OR (v_tipo_alvo = 'rip' AND c.inferred_type = 'rip')
    )
    ORDER BY c.feat_id, c.has_perm DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.pesquisar_registro_interinstitucional(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pesquisar_registro_interinstitucional(text, text) TO authenticated;

COMMENT ON FUNCTION public.pesquisar_registro_interinstitucional(text, text) IS 
'Pesquisa rápida interinstitucional blindada contra vazamento de sigilo e otimizada em 2 etapas para evitar timeout.';
