-- ============================================================
-- SCRIPT DE ADIÇÃO DE LOGO AOS MUNICÍPIOS
-- Execute no SQL Editor do Supabase
-- ============================================================

ALTER TABLE public.municipios ADD COLUMN IF NOT EXISTS logo_url text;

-- Permite ao SuperAdmin atualizar qualquer campo dos municípios (nome, uf, ativo, logo_url)
DROP POLICY IF EXISTS municipios_update_super_admin ON public.municipios;
CREATE POLICY municipios_update_super_admin ON public.municipios
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.super_admin = true
    )
  );

-- ============================================================
-- POLÍTICAS DE STORAGE PARA O BUCKET 'arquivos-obras' (LOGOS)
-- ============================================================

-- Permite upload (INSERT) para usuários autenticados
DROP POLICY IF EXISTS "arquivos_obras_insert_auth" ON storage.objects;
CREATE POLICY "arquivos_obras_insert_auth" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'arquivos-obras');

-- Permite substituição/atualização (UPDATE) para usuários autenticados
DROP POLICY IF EXISTS "arquivos_obras_update_auth" ON storage.objects;
CREATE POLICY "arquivos_obras_update_auth" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'arquivos-obras');

-- Permite leitura pública (SELECT) de arquivos do bucket
DROP POLICY IF EXISTS "arquivos_obras_select_public" ON storage.objects;
CREATE POLICY "arquivos_obras_select_public" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'arquivos-obras');

