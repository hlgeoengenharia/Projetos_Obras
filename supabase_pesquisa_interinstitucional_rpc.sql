-- ==============================================================================
-- PESQUISA RÁPIDA INTERINSTITUCIONAL (FUNÇÃO RPC COM SECURITY DEFINER)
-- Implementada em 2 Etapas Estratégicas para Alta Performance e Zero Timeout:
-- 1ª Etapa: Identifica as camadas (temas) que possuem os tipos de dados dos entes
--           (IPL/Processos do MPF, EPOL da PF, RIP da SPU).
-- 2ª Etapa: Varre cirurgicamente APENAS as feições dessas camadas identificadas.
-- ==============================================================================

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
    v_has_target_themes boolean;
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
        SELECT tf.id AS form_id
        FROM public.forms tf
        WHERE (
            v_tipo_alvo = 'todos'
            OR (v_tipo_alvo = 'ipl' AND tf."schema"::text ~* '(ipl|inquerito|inquérito|processo|autos|judicial)')
            OR (v_tipo_alvo = 'epol' AND tf."schema"::text ~* '(epol|policia federal|dpf)')
            OR (v_tipo_alvo = 'rip' AND tf."schema"::text ~* '(rip|spu|patrimonio|patrimônio|uniao|união)')
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
            -- Busca de alta precisão (documentos/processos) ignora o filtro rígido de nome da camada
            length(v_digits) >= 11
            OR
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
            OR (length(v_digits) >= 5 AND f.propriedades::text ILIKE ('%' || v_digits || '%'))
            OR (length(v_digits) >= 7 AND f.propriedades::text ILIKE ('%' || substring(v_digits from 1 for 7) || '%'))
        )
        LIMIT 500
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
                WHEN jsonb_typeof(cf.feat_props::jsonb) = 'object' THEN cf.feat_props::jsonb 
                ELSE '{}'::jsonb 
            END
        ) kv
        WHERE kv.key NOT IN ('themeId', 'id_banco', 'geometry', '_geometry')
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
                WHEN length(v_digits) = 20 OR length(mp.p_digits) = 20 OR lower(mp.p_key) LIKE '%ipl%' OR lower(mp.p_key) LIKE '%inquerito%' OR lower(mp.p_key) LIKE '%processo%' OR lower(mp.p_key) LIKE '%autos%' THEN 'ipl'
                WHEN length(v_digits) = 11 OR lower(mp.p_key) LIKE '%epol%' OR (length(mp.p_digits) = 11 AND mp.p_val LIKE '%.%') THEN 'epol'
                WHEN (length(v_digits) BETWEEN 8 AND 13) OR lower(mp.p_key) LIKE '%rip%' OR (length(mp.p_digits) BETWEEN 8 AND 13 AND (lower(mp.p_key) LIKE '%imovel%' OR lower(mp.p_key) LIKE '%patrimonio%' OR lower(mp.p_key) LIKE '%spu%')) THEN 'rip'
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
'Pesquisa interinstitucional otimizada em 2 etapas: primeiro mapeia as camadas com campos dos entes e depois busca cirurgicamente sem timeout.';
