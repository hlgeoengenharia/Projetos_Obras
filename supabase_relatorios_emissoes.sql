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
