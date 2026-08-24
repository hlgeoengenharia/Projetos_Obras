-- ============================================================
-- ADMIN DE ENTE (aprova colegas do mesmo órgão, sem virar admin de
-- nenhum município)
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Hoje só existem dois níveis de administração: super_admin (a plataforma
-- inteira) e admin de município (papel='admin' em municipio_membros, dono
-- dos dados daquele município). Falta um terceiro: alguém do MPF/PF/SPU/
-- Prefeitura que pode aprovar/gerenciar pedidos de acesso de OUTRAS pessoas
-- do mesmo órgão, em qualquer município — sem ganhar controle nenhum
-- sobre os dados em si.
--
-- Isso não é por município (é por entidade), então não cabe numa linha de
-- municipio_membros como o papel de admin normal. Fica em profiles: uma
-- flag (entidade_admin) + qual é a entidade dessa pessoa (entidade).
-- É o próprio super_admin quem marca essa flag manualmente (não tem tela
-- pra isso ainda, só SQL direto — mesma lógica do bootstrap do
-- super_admin).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS entidade_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS entidade text;

CREATE OR REPLACE FUNCTION public.is_entidade_admin_for(p_entidade text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND entidade_admin AND entidade = p_entidade
  );
$$;

-- --- municipio_membros: admin de ente enxerga e decide pedidos do
-- próprio ente (em qualquer município), mas nunca pode conceder
-- papel='admin' (isso continua exclusivo de super_admin/admin do
-- município) ---------------------------------------------------------
DROP POLICY IF EXISTS membros_select ON public.municipio_membros;
CREATE POLICY membros_select ON public.municipio_membros
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
    OR public.is_entidade_admin_for(entidade)
  );

DROP POLICY IF EXISTS membros_insert_self_or_admin ON public.municipio_membros;
CREATE POLICY membros_insert_self_or_admin ON public.municipio_membros
  FOR INSERT WITH CHECK (
    (user_id = auth.uid() AND status = 'pendente' AND papel = 'visualizador')
    OR public.is_super_admin()
    OR public.is_municipio_admin(municipio_id)
    OR (public.is_entidade_admin_for(entidade) AND papel <> 'admin')
  );

DROP POLICY IF EXISTS membros_update_admin ON public.municipio_membros;
CREATE POLICY membros_update_admin ON public.municipio_membros
  FOR UPDATE USING (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id) OR public.is_entidade_admin_for(entidade)
  ) WITH CHECK (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id) OR (public.is_entidade_admin_for(entidade) AND papel <> 'admin')
  );

-- --- profiles: admin de ente precisa ver nome/e-mail de quem pediu
-- acesso (join profiles!user_id na tela de Solicitações) ------------
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = profiles.id
        AND public.is_entidade_admin_for(mm.entidade)
    )
  );

-- Depois de rodar, marque manualmente quem vai ser admin de ente
-- (troque o e-mail e a entidade pelo caso real — o texto de "entidade"
-- precisa bater exatamente com o que fica salvo em municipio_membros.entidade,
-- que por sua vez vem do nome cadastrado em entidades_padrao):
-- UPDATE public.profiles SET entidade_admin = true, entidade = 'Ministério Público Federal (MPF)'
-- WHERE email = 'email-da-pessoa@exemplo.com';
