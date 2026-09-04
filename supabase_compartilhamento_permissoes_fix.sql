-- ==============================================================================
-- CORREÇÃO DE RLS: PERMISSÕES DE CAMADA E ABA PARA COMPARTILHAMENTO INTERINSTITUCIONAL
-- ==============================================================================
-- Permite que Administradores concedam permissões de camadas e abas tanto para
-- servidores da sua própria equipe quanto para Pontos Focais de órgãos parceiros
-- (Prefeitura, SPU, MPF, PF, etc.) sem violar a política de Row Level Security (RLS).
-- ==============================================================================

-- 1. TABELA permissoes_camada
DROP POLICY IF EXISTS permissoes_insert_admin ON public.permissoes_camada;
DROP POLICY IF EXISTS permissoes_update_admin ON public.permissoes_camada;
DROP POLICY IF EXISTS permissoes_delete_admin ON public.permissoes_camada;
DROP POLICY IF EXISTS permissoes_select_own_or_admin ON public.permissoes_camada;
DROP POLICY IF EXISTS permissoes_camada_all_admin ON public.permissoes_camada;
DROP POLICY IF EXISTS permissoes_camada_select_auth ON public.permissoes_camada;

-- Leitura: Qualquer usuário autenticado pode ler permissões de camadas
CREATE POLICY permissoes_camada_select_auth ON public.permissoes_camada
  FOR SELECT USING (auth.role() = 'authenticated');

-- Gestão: SuperAdmin ou Administradores de município/ente podem gerenciar (INSERT, UPDATE, DELETE)
CREATE POLICY permissoes_camada_all_admin ON public.permissoes_camada
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  );

-- 2. TABELA permissoes_aba
DROP POLICY IF EXISTS permissoes_aba_select_own_or_admin ON public.permissoes_aba;
DROP POLICY IF EXISTS permissoes_aba_insert_admin ON public.permissoes_aba;
DROP POLICY IF EXISTS permissoes_aba_update_admin ON public.permissoes_aba;
DROP POLICY IF EXISTS permissoes_aba_delete_admin ON public.permissoes_aba;
DROP POLICY IF EXISTS permissoes_aba_all_admin ON public.permissoes_aba;
DROP POLICY IF EXISTS permissoes_aba_select_auth ON public.permissoes_aba;

-- Leitura: Qualquer usuário autenticado pode ler permissões de abas
CREATE POLICY permissoes_aba_select_auth ON public.permissoes_aba
  FOR SELECT USING (auth.role() = 'authenticated');

-- Gestão: SuperAdmin ou Administradores de município/ente podem gerenciar (INSERT, UPDATE, DELETE)
CREATE POLICY permissoes_aba_all_admin ON public.permissoes_aba
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  );

-- 3. TABELA permissoes_raster (Garante consistência total)
DROP POLICY IF EXISTS permissoes_raster_select_authenticated ON public.permissoes_raster;
DROP POLICY IF EXISTS permissoes_raster_all_admin ON public.permissoes_raster;

CREATE POLICY permissoes_raster_select_authenticated ON public.permissoes_raster
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY permissoes_raster_all_admin ON public.permissoes_raster
  FOR ALL USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (p.super_admin OR p.entidade_admin)
    )
  );
