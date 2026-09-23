-- ==============================================================================
-- SINCRONIZAÇÃO E CORREÇÃO DEFINITIVA DE PERMISSÕES DE ABAS E ENTIDADES
-- ==============================================================================
-- 1. Remove registros da aba obsoleta tab_4ar8n42x7 (removida do formulário MPF).
-- 2. Concede permissões explícitas das abas CORRELATOS (tab_vdsh1uzbd) e
--    Relatórios (tab_ou5n2fa83) para Klebson e demais usuários do MPF e outros entes.
-- 3. Atualiza políticas RLS de permissoes_aba para garantir que administradores
--    de município e de ente consigam gerenciar abas de formulários sem erro 42501.
-- ==============================================================================

-- 1. LIMPEZA DE ABAS OBSOLETAS
DELETE FROM public.permissoes_aba 
WHERE tab_id = 'tab_4ar8n42x7';

-- 2. SINCRONIZAÇÃO DAS ABAS 'CORRELATOS' E 'Relatórios' NO FORMULÁRIO MPF
-- Form: 65a13024-4d19-42fc-8efa-d8fbf9a8d74c
-- Klebson (0c06d212-4ef5-4ba5-a3f1-b8dee736a46e): MPF Assessor/Admin em Cabedelo
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('0c06d212-4ef5-4ba5-a3f1-b8dee736a46e', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', true, true),
  ('0c06d212-4ef5-4ba5-a3f1-b8dee736a46e', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', true, true)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- Joana Queiroga (0f28c20a-d099-4954-863e-74b4907694f1): MPF
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('0f28c20a-d099-4954-863e-74b4907694f1', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', true, true),
  ('0f28c20a-d099-4954-863e-74b4907694f1', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', true, false)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- Usuários externos (Prefeitura Municipal):
-- Ikaro Patrick (76f6954a-cb31-4dbb-9d9b-b062639e3dc0)
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('76f6954a-cb31-4dbb-9d9b-b062639e3dc0', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', false, false),
  ('76f6954a-cb31-4dbb-9d9b-b062639e3dc0', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', false, false)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- Layse Albuquerque (0abe62b4-206d-4722-8173-086a064f84ff)
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('0abe62b4-206d-4722-8173-086a064f84ff', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', false, false),
  ('0abe62b4-206d-4722-8173-086a064f84ff', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', false, false)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- Ana Laura Travassos (3436e26b-3414-4602-98fd-2ef931a15609)
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('3436e26b-3414-4602-98fd-2ef931a15609', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', false, false),
  ('3436e26b-3414-4602-98fd-2ef931a15609', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', false, false)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- Rodrigo Martines (54587bcd-d64a-4f35-9795-a5308687900b)
INSERT INTO public.permissoes_aba (user_id, form_id, tab_id, pode_ver, pode_editar)
VALUES 
  ('54587bcd-d64a-4f35-9795-a5308687900b', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_vdsh1uzbd', false, false),
  ('54587bcd-d64a-4f35-9795-a5308687900b', '65a13024-4d19-42fc-8efa-d8fbf9a8d74c', 'tab_ou5n2fa83', false, false)
ON CONFLICT (user_id, form_id, tab_id) 
DO UPDATE SET pode_ver = EXCLUDED.pode_ver, pode_editar = EXCLUDED.pode_editar;

-- 3. AJUSTE DE RLS PARA permissoes_aba
-- Garante que administradores de município ou de ente consigam delegar permissões de abas
ALTER TABLE public.permissoes_aba ENABLE ROW LEVEL SECURITY;

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
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND (COALESCE(p.super_admin, false) OR COALESCE(p.entidade_admin, false))
    )
  );
