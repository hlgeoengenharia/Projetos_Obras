-- ==============================================================================
-- RELATÓRIOS A4: AJUSTES DO USUÁRIO NO RELATÓRIO GERADO (POR RELATÓRIO + FEIÇÃO)
-- ==============================================================================
-- Guarda o que o usuário configura no relatório aberto no navegador: camadas ligadas
-- no mini-mapa, destaque, mapa base, títulos de pontos, medidas editadas etc.
-- Cada usuário enxerga e altera SOMENTE os próprios ajustes (RLS).
-- Execute no SQL Editor do Supabase. Pode ser rodado mais de uma vez.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.relatorios_ajustes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    form_id     TEXT,
    user_id     UUID NOT NULL DEFAULT auth.uid(),
    ajustes     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT relatorios_ajustes_unico UNIQUE (template_id, feature_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_ajustes_lookup
    ON public.relatorios_ajustes (template_id, feature_key);

ALTER TABLE public.relatorios_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorios_ajustes_select_own ON public.relatorios_ajustes;
CREATE POLICY relatorios_ajustes_select_own ON public.relatorios_ajustes
    FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS relatorios_ajustes_insert_own ON public.relatorios_ajustes;
CREATE POLICY relatorios_ajustes_insert_own ON public.relatorios_ajustes
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS relatorios_ajustes_update_own ON public.relatorios_ajustes;
CREATE POLICY relatorios_ajustes_update_own ON public.relatorios_ajustes
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS relatorios_ajustes_delete_own ON public.relatorios_ajustes;
CREATE POLICY relatorios_ajustes_delete_own ON public.relatorios_ajustes
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Sem acesso anônimo
REVOKE ALL ON public.relatorios_ajustes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios_ajustes TO authenticated;

COMMENT ON TABLE public.relatorios_ajustes IS 'Ajustes que cada usuário faz no relatório individual gerado (mini-mapa, pontos, medidas), por modelo + feição.';
