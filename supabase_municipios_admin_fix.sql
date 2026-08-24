-- ============================================================
-- PERMITE O SUPER_ADMIN CADASTRAR NOVOS MUNICÍPIOS PELA TELA
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- municipios só tinha política de leitura (pública, de propósito — o
-- cadastro precisa listar municípios antes de existir sessão). Sem uma
-- política de escrita, o RLS recusa qualquer INSERT/UPDATE por padrão,
-- mesmo vindo do super_admin.

DROP POLICY IF EXISTS municipios_insert_super_admin ON public.municipios;
CREATE POLICY municipios_insert_super_admin ON public.municipios
  FOR INSERT WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS municipios_update_super_admin ON public.municipios;
CREATE POLICY municipios_update_super_admin ON public.municipios
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
