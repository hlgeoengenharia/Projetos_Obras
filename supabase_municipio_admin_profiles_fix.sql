-- ============================================================
-- CORREÇÃO: admin de município via "(sem nome)" nos pedidos/usuários de
-- outras pessoas
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- A política de leitura de profiles já deixava um admin de ENTE ver o
-- nome/e-mail de outras pessoas (pro join profiles!user_id funcionar em
-- Solicitações). Mas nunca foi estendida pro admin de MUNICÍPIO — que é
-- quem agora decide as solicitações do próprio município (a rota por
-- entidade foi removida). Sem isso, o join profiles!user_id volta vazio
-- pra ele, e o nome aparece como "(sem nome)" em home.html e settings.html.

DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = profiles.id
        AND (
          public.is_entidade_admin_for(mm.entidade)
          OR public.is_municipio_admin(mm.municipio_id)
        )
    )
  );
