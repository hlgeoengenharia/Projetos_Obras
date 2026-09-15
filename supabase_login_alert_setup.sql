-- ==============================================================================
-- SCRIPT: supabase_login_alert_setup.sql
-- DESCRIÇÃO: Tabela e políticas de auditoria para registros de alertas de login e
--            aceite de termos da LGPD (Lei Geral de Proteção de Dados - Lei 13.709/2018).
-- ==============================================================================

-- 1. Criação da tabela de registro de consentimento LGPD
CREATE TABLE IF NOT EXISTS public.lgpd_aceites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    user_nome TEXT,
    termo_versao TEXT DEFAULT '1.0',
    aceito_em TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    ip_address TEXT
);

-- Habilita Row Level Security
ALTER TABLE public.lgpd_aceites ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Usuário pode registrar seu próprio aceite LGPD" ON public.lgpd_aceites;
CREATE POLICY "Usuário pode registrar seu próprio aceite LGPD" 
ON public.lgpd_aceites 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários e administradores podem visualizar aceites" ON public.lgpd_aceites;
CREATE POLICY "Usuários e administradores podem visualizar aceites" 
ON public.lgpd_aceites 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND super_admin = true));

-- 2. Permissão de acesso
GRANT ALL ON TABLE public.lgpd_aceites TO authenticated;
GRANT ALL ON TABLE public.lgpd_aceites TO service_role;

-- 3. Comentários para documentação do schema
COMMENT ON TABLE public.lgpd_aceites IS 'Registros formais de ciência e concordância com os Termos de Proteção de Dados (LGPD) e Notificações de Login';
