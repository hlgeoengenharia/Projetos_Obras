-- ==============================================================================
-- SETUP DO MÓDULO DE ORÇAMENTO DE OBRAS PÚBLICAS ("GeoOrçamento")
-- Compatível com Nova Lei de Licitações (14.133/2021) & SINAPI / Caixa Econômica
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.obras_orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    municipio_id UUID REFERENCES public.municipios(id) ON DELETE CASCADE,
    feature_id TEXT, -- Vínculo com a feição vetorial do mapa (Ponto da Obra)
    nome_obra TEXT NOT NULL,
    local_obra TEXT,
    responsavel_tecnico TEXT,
    art_rrt TEXT,
    data_base_sinapi TEXT DEFAULT '07/2026',
    uf TEXT DEFAULT 'PB',
    regime_desoneracao TEXT DEFAULT 'DESONERADO',
    bdi_percentual NUMERIC(6,4) DEFAULT 0.2480,
    bdi_config JSONB DEFAULT '{}'::jsonb,
    prazo_meses INTEGER DEFAULT 6,
    etapas JSONB DEFAULT '[]'::jsonb,
    cronograma JSONB DEFAULT '{}'::jsonb,
    valor_total_sem_bdi NUMERIC(15,2) DEFAULT 0.00,
    valor_total_com_bdi NUMERIC(15,2) DEFAULT 0.00,
    status TEXT DEFAULT 'EM_ELABORACAO', -- 'EM_ELABORACAO', 'APROVADO', 'LICITADO', 'CONCLUIDO'
    criado_por UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de performance para busca instantânea
CREATE INDEX IF NOT EXISTS idx_obras_orcamentos_municipio ON public.obras_orcamentos(municipio_id);
CREATE INDEX IF NOT EXISTS idx_obras_orcamentos_feature ON public.obras_orcamentos(feature_id);
CREATE INDEX IF NOT EXISTS idx_obras_orcamentos_status ON public.obras_orcamentos(status);

-- Habilitar RLS
ALTER TABLE public.obras_orcamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso por município
DROP POLICY IF EXISTS "Permitir leitura de orçamentos do próprio município" ON public.obras_orcamentos;
CREATE POLICY "Permitir leitura de orçamentos do próprio município" ON public.obras_orcamentos
FOR SELECT USING (
    municipio_id IS NULL 
    OR municipio_id = ((auth.jwt() -> 'user_metadata' ->> 'municipio_id')::uuid)
    OR (auth.jwt() -> 'user_metadata' ->> 'papel') = 'superadmin'
);

DROP POLICY IF EXISTS "Permitir gravação de orçamentos do município" ON public.obras_orcamentos;
CREATE POLICY "Permitir gravação de orçamentos do município" ON public.obras_orcamentos
FOR ALL USING (
    municipio_id = ((auth.jwt() -> 'user_metadata' ->> 'municipio_id')::uuid)
    OR (auth.jwt() -> 'user_metadata' ->> 'papel') = 'superadmin'
);
