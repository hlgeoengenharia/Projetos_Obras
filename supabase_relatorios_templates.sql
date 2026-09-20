-- ==============================================================================
-- MIGRAÇÃO SUPABASE: TABELA relatorios_templates (RELATÓRIOS A4 E GERENCIAIS)
-- ==============================================================================
-- Permite persistir templates de relatórios personalizados no Supabase com RLS.
-- Execute este script no SQL Editor do Dashboard do Supabase.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.relatorios_templates (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'individual', -- 'individual' ou 'geral'
    disponibilizar_no_mapa BOOLEAN DEFAULT false,
    config_pagina JSONB DEFAULT '{"tamanho": "A4", "orientacao": "portrait"}'::jsonb,
    blocos JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para buscas rápidas por formulário e tipo
CREATE INDEX IF NOT EXISTS idx_relatorios_templates_form_id ON public.relatorios_templates(form_id);
CREATE INDEX IF NOT EXISTS idx_relatorios_templates_tipo ON public.relatorios_templates(tipo);

-- Habilita Row Level Security (RLS)
ALTER TABLE public.relatorios_templates ENABLE ROW LEVEL SECURITY;

-- Política de leitura: somente usuários autenticados (sem acesso anônimo)
DROP POLICY IF EXISTS "Permitir leitura de templates para usuarios autenticados" ON public.relatorios_templates;
CREATE POLICY "Permitir leitura de templates para usuarios autenticados"
ON public.relatorios_templates
FOR SELECT
TO authenticated
USING (true);

-- Política de inserção / atualização / exclusão: somente usuários autenticados
DROP POLICY IF EXISTS "Permitir gerenciamento de templates" ON public.relatorios_templates;
CREATE POLICY "Permitir gerenciamento de templates"
ON public.relatorios_templates
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Notifica conclusão
COMMENT ON TABLE public.relatorios_templates IS 'Templates de relatório A4 (individuais e gerenciais) configurados no Construtor de Relatórios';
