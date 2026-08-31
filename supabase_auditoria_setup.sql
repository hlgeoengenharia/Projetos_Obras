-- ==============================================================================
-- SISTEMA DE AUDITORIA, LOGS DE ATIVIDADE E MONITORAMENTO DE USUÁRIOS ONLINE
-- ==============================================================================

-- 1. Adiciona coluna last_seen_at na tabela profiles para rastrear presença online
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN last_seen_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- 2. Tabela de Logs de Auditoria
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    user_nome TEXT,
    user_email TEXT,
    entidade_id TEXT,
    municipio_id UUID,
    tipo_acao TEXT NOT NULL, -- 'LOGIN', 'LOGOUT', 'CRIAR_FEICAO', 'EDITAR_FEICAO', 'EXCLUIR_FEICAO', 'IMPORTAR_CAMADA', 'EDITAR_CAMADA', 'EXCLUIR_CAMADA', 'RECONECTAR_ATRIBUTOS', 'ALTERAR_PERMISSOES'
    alvo TEXT,              -- Identificador legível do item afetado (ex: "Imóvel #10092099", "Camada CTM-Municipal")
    detalhes JSONB DEFAULT '{}'::jsonb, -- Metadados, dados antes/depois, campos alterados
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices de alta performance para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_created_at ON public.auditoria_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_user_id ON public.auditoria_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_logs_tipo_acao ON public.auditoria_logs (tipo_acao);

-- 3. Habilita RLS
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Política de Inserção: Qualquer usuário autenticado pode registrar ações
DROP POLICY IF EXISTS "Usuários autenticados podem inserir logs" ON public.auditoria_logs;
CREATE POLICY "Usuários autenticados podem inserir logs" 
ON public.auditoria_logs FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Política de Leitura: SuperAdmin e Administradores podem ler logs de auditoria
DROP POLICY IF EXISTS "SuperAdmin e Admin podem ler logs de auditoria" ON public.auditoria_logs;
CREATE POLICY "SuperAdmin e Admin podem ler logs de auditoria" 
ON public.auditoria_logs FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE public.profiles.id = auth.uid() 
        AND (
            public.profiles.super_admin = true 
            OR public.profiles.papel = 'admin' 
            OR public.profiles.papel = 'superadmin'
        )
    )
    OR
    EXISTS (
        SELECT 1 FROM public.municipio_membros
        WHERE public.municipio_membros.user_id = auth.uid()
        AND public.municipio_membros.papel = 'admin'
        AND public.municipio_membros.status = 'aprovado'
    )
);

-- 4. Função RPC para buscar usuários online nos últimos 3 minutos
CREATE OR REPLACE FUNCTION public.get_usuarios_online(p_entidade_id TEXT DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    nome TEXT,
    email TEXT,
    papel TEXT,
    last_seen_at TIMESTAMPTZ,
    minutos_inativo NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        COALESCE(NULLIF(p.nome, ''), 'Usuário') AS nome,
        p.email,
        p.papel,
        p.last_seen_at,
        ROUND(EXTRACT(EPOCH FROM (now() - p.last_seen_at)) / 60, 1) AS minutos_inativo
    FROM public.profiles p
    WHERE p.last_seen_at >= now() - INTERVAL '3 minutes'
    ORDER BY p.last_seen_at DESC;
END $$;
