-- ==============================================================================
-- SISTEMA DE MONITORAMENTO E TELEMETRIA DE FISCAIS DE CAMPO
-- Script de Criação das Tabelas, Índices e Políticas de Segurança (RLS)
-- ==============================================================================

-- 1. HISTÓRICO DE POSIÇÕES / TELEMETRIA GPS (Trilha e Breadcrumbs do Fiscal)
CREATE TABLE IF NOT EXISTS public.fiscal_posicoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_nome TEXT,
    entidade_id TEXT,
    unidade TEXT,
    setor TEXT,
    municipio_id TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precisao_metros REAL DEFAULT 0,
    velocidade_kmh REAL DEFAULT 0,
    bateria_nivel REAL DEFAULT 100,
    status_atividade TEXT DEFAULT 'deslocamento', -- 'vistoria', 'deslocamento', 'parado', 'pausa'
    vistoria_id TEXT, -- ID opcional da feição/vistoria concluída neste ponto
    camada_id TEXT,   -- ID opcional da camada onde a vistoria ocorreu
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_fiscal_posicoes_user_created ON public.fiscal_posicoes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_posicoes_unidade_data ON public.fiscal_posicoes(unidade, setor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_posicoes_municipio ON public.fiscal_posicoes(municipio_id, created_at DESC);

-- 2. STATUS EM TEMPO REAL (Última Posição Rápida Consolidada por Fiscal)
CREATE TABLE IF NOT EXISTS public.fiscal_status_atual (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_nome TEXT,
    user_email TEXT,
    entidade_id TEXT,
    unidade TEXT,
    setor TEXT,
    municipio_id TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    precisao_metros REAL DEFAULT 0,
    velocidade_kmh REAL DEFAULT 0,
    bateria_nivel REAL DEFAULT 100,
    status_atividade TEXT DEFAULT 'ativo', -- 'ativo', 'vistoria', 'pausa', 'offline'
    em_jornada BOOLEAN DEFAULT false,
    total_vistorias_hoje INTEGER DEFAULT 0,
    km_percorridos_hoje REAL DEFAULT 0,
    inicio_jornada_em TIMESTAMPTZ,
    ultima_atualizacao TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_status_unidade ON public.fiscal_status_atual(unidade, setor, em_jornada);

-- 3. CONFIGURAÇÃO DE MÉTRICAS DINÂMICAS DE PRODUTIVIDADE (Definidas pelo Admin)
CREATE TABLE IF NOT EXISTS public.fiscal_metricas_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entidade_id TEXT,
    unidade TEXT,
    setor TEXT,
    municipio_id TEXT,
    nome TEXT NOT NULL,                     -- Ex: 'Autos de Infração Lavrados'
    descricao TEXT,                         -- Ex: 'Contagem de autos emitidos em vistorias urbanas'
    camada_id TEXT NOT NULL,                -- Ex: 'fiscalizacao_obras'
    campo_nome TEXT,                        -- Ex: 'tipo_acao' (se null, conta feições da camada)
    condicao_operador TEXT DEFAULT 'igual', -- 'igual', 'diferente', 'contem', 'maior', 'soma'
    valor_comparacao TEXT,                  -- Ex: 'Auto de Infração'
    tipo_calculo TEXT DEFAULT 'contagem',   -- 'contagem', 'soma'
    icone TEXT DEFAULT 'assignment_turned_in',
    cor TEXT DEFAULT 'sky',                 -- 'sky', 'emerald', 'amber', 'rose', 'purple', 'indigo'
    meta_diaria INTEGER DEFAULT 0,          -- Meta diária opcional por fiscal
    ativo BOOLEAN DEFAULT true,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_metricas_unidade ON public.fiscal_metricas_config(unidade, setor, ativo);

-- 4. POLÍTICAS DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.fiscal_posicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_status_atual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_metricas_config ENABLE ROW LEVEL SECURITY;

-- 4.1 Regras para fiscal_posicoes:
-- O fiscal autenticado pode inserir suas próprias coordenadas
DROP POLICY IF EXISTS "Fiscais inserem suas próprias posições" ON public.fiscal_posicoes;
CREATE POLICY "Fiscais inserem suas próprias posições"
    ON public.fiscal_posicoes
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Usuários e Admins autenticados podem consultar posições
DROP POLICY IF EXISTS "Leitura de posições permitida a autenticados" ON public.fiscal_posicoes;
CREATE POLICY "Leitura de posições permitida a autenticados"
    ON public.fiscal_posicoes
    FOR SELECT
    TO authenticated
    USING (true);

-- 4.2 Regras para fiscal_status_atual:
DROP POLICY IF EXISTS "Fiscais atualizam seu próprio status" ON public.fiscal_status_atual;
CREATE POLICY "Fiscais atualizam seu próprio status"
    ON public.fiscal_status_atual
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.papel = 'admin' OR p.super_admin = true)
    ))
    WITH CHECK (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.papel = 'admin' OR p.super_admin = true)
    ));

-- 4.3 Regras para fiscal_metricas_config:
DROP POLICY IF EXISTS "Todos autenticados leem métricas ativas" ON public.fiscal_metricas_config;
CREATE POLICY "Todos autenticados leem métricas ativas"
    ON public.fiscal_metricas_config
    FOR SELECT
    TO authenticated
    USING (ativo = true OR criado_por = auth.uid());

DROP POLICY IF EXISTS "Admins gerenciam métricas" ON public.fiscal_metricas_config;
CREATE POLICY "Admins gerenciam métricas"
    ON public.fiscal_metricas_config
    FOR ALL
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.papel = 'admin' OR p.super_admin = true)
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.papel = 'admin' OR p.super_admin = true)
    ));

-- 5. FLAG DE FISCAL DE CAMPO NO PERFIL DO USUÁRIO
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fiscal_campo BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_profiles_fiscal_campo ON public.profiles(unidade, setor, fiscal_campo);

