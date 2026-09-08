-- ==============================================================================
-- FIX DE RLS: LIBERAÇÃO DE ACESSO A ORTOFOTOS (IMAGENS_RASTER E PERMISSOES_RASTER)
-- Execute no SQL Editor do Supabase para garantir que usuários autorizados
-- possam visualizar as ortofotos e usar o comparador temporal sem restrição.
-- ==============================================================================

-- 1. Garante que qualquer usuário autenticado possa ler a lista de imagens raster do município
-- (o isolamento e permissão fina de exibição são controlados por permissoes_raster e pelas regras de entidade)
DROP POLICY IF EXISTS imagens_raster_select_authenticated ON public.imagens_raster;
CREATE POLICY imagens_raster_select_authenticated ON public.imagens_raster
  FOR SELECT USING (auth.role() = 'authenticated');

-- 2. Garante a tabela permissoes_raster com RLS correto
CREATE TABLE IF NOT EXISTS public.permissoes_raster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  raster_id uuid NOT NULL REFERENCES public.imagens_raster(id) ON DELETE CASCADE,
  pode_ver boolean NOT NULL DEFAULT true,
  concedido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, raster_id)
);

ALTER TABLE public.permissoes_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissoes_raster_select_authenticated ON public.permissoes_raster;
CREATE POLICY permissoes_raster_select_authenticated ON public.permissoes_raster
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS permissoes_raster_all_admin ON public.permissoes_raster;
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
