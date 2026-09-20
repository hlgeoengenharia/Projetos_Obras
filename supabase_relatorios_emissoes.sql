-- ==============================================================================
-- RELATÓRIOS A4: REGISTRO DE EMISSÕES (PROTOCOLO + SHA-256)
-- ==============================================================================
-- Cada vez que um usuário imprime ou exporta um relatório, o sistema registra o protocolo
-- (AAAAMMDD-XXXXXXXX) e o SHA-256 do conteúdo. Serve de base para verificar depois que um
-- documento impresso corresponde ao que foi emitido. Cada usuário enxerga só os próprios registros.
-- (A consulta pública de autenticidade por protocolo/QR code fica para uma etapa futura.)
-- Execute no SQL Editor do Supabase. Pode ser rodado mais de uma vez.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.relatorios_emissoes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    protocolo   TEXT NOT NULL,
    hash        TEXT NOT NULL,
    template_id TEXT,
    feature_key TEXT,
    form_id     TEXT,
    formato     TEXT,
    user_id     UUID NOT NULL DEFAULT auth.uid(),
    emitido_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT relatorios_emissoes_unico UNIQUE (protocolo, formato, user_id)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_emissoes_protocolo ON public.relatorios_emissoes (protocolo);
CREATE INDEX IF NOT EXISTS idx_relatorios_emissoes_feicao ON public.relatorios_emissoes (template_id, feature_key);

ALTER TABLE public.relatorios_emissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorios_emissoes_select_own ON public.relatorios_emissoes;
CREATE POLICY relatorios_emissoes_select_own ON public.relatorios_emissoes
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS relatorios_emissoes_insert_own ON public.relatorios_emissoes;
CREATE POLICY relatorios_emissoes_insert_own ON public.relatorios_emissoes
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Registros de emissão não se alteram nem se apagam pelo app (trilha de auditoria)
REVOKE ALL ON public.relatorios_emissoes FROM anon;
REVOKE UPDATE, DELETE ON public.relatorios_emissoes FROM authenticated;
GRANT SELECT, INSERT ON public.relatorios_emissoes TO authenticated;

COMMENT ON TABLE public.relatorios_emissoes IS 'Emissões de relatório individual (impressão/exportação): protocolo e SHA-256 do conteúdo.';

-- ==============================================================================
-- VERIFICAÇÃO PÚBLICA DE AUTENTICIDADE (verificar.html / QR code do rodapé)
-- ==============================================================================
-- Qualquer pessoa (inclusive sem login) pode perguntar "este protocolo existe? este SHA-256 confere?".
-- A função só devolve: se existe, quando e em que formato foi emitido, e se o SHA-256 informado confere.
-- NÃO devolve usuário, modelo, feição nem nenhum dado do relatório. A tabela continua fechada ao anônimo.
-- Observação: não há limite de tentativas; o protocolo tem 8 caracteres hexadecimais + a data, então a
-- função só confirma existência (nunca lista) e não revela conteúdo.

CREATE OR REPLACE FUNCTION public.verificar_emissao(p_protocolo text, p_hash text DEFAULT NULL)
RETURNS TABLE (encontrado boolean, emitido_em timestamptz, formato text, hash_confere boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT true,
           e.emitido_em,
           e.formato,
           CASE WHEN p_hash IS NULL OR length(p_hash) < 8 THEN NULL
                ELSE (e.hash LIKE (lower(regexp_replace(p_hash, '[^0-9a-fA-F]', '', 'g')) || '%'))
           END
    FROM public.relatorios_emissoes e
    WHERE e.protocolo = upper(trim(p_protocolo))
    ORDER BY e.emitido_em ASC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verificar_emissao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_emissao(text, text) TO anon, authenticated;
