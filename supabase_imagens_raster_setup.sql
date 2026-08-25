-- ============================================================
-- IMAGENS RASTER (GeoTIFF/ortofoto) — tabela + bucket + RLS
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- O motor de importação de GeoTIFF já existe pronto em src/main.js
-- (processGeoTIFF: lê o arquivo, reprojeta o bbox, comprime pra WebP, sobe
-- pro Storage e grava aqui) — mas a tabela `imagens_raster` e o bucket
-- `rasters` que esse código usa nunca foram criados por um script
-- versionado. Sem isso, a importação falha silenciosamente (o front trata
-- "tabela não existe" como não-erro, só nunca aparece nada na lista).
--
-- Igual a `temas`: cada imagem pertence a UM município. Segue o mesmo
-- momento do resto do RLS deste projeto — leitura liberada pra quem está
-- autenticado (a Parte 2 que fecha leitura por completo ainda está
-- pendente, igual pra `temas`/`feicoes`), escrita (inserir/editar/excluir)
-- restrita a admin do município ou super_admin.

-- CREATE TABLE IF NOT EXISTS não ajuda se a tabela já existir com colunas
-- diferentes (foi o caso aqui — ela já tinha sido criada manualmente antes,
-- sem município nenhum). Cria do zero se não existir, e complementa com
-- ALTER TABLE se já existir — funciona nos dois casos.
CREATE TABLE IF NOT EXISTS public.imagens_raster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  url_imagem text NOT NULL,
  bbox jsonb DEFAULT '[]'::jsonb,
  tipo text DEFAULT 'xyz_tiles',
  zoom_min integer DEFAULT 12,
  zoom_max integer DEFAULT 24,
  opacidade numeric NOT NULL DEFAULT 0.8,
  visivel boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.imagens_raster ADD COLUMN IF NOT EXISTS municipio_id uuid REFERENCES public.municipios(id) ON DELETE CASCADE;
ALTER TABLE public.imagens_raster ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.imagens_raster ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'xyz_tiles';
ALTER TABLE public.imagens_raster ADD COLUMN IF NOT EXISTS zoom_min integer DEFAULT 12;
ALTER TABLE public.imagens_raster ADD COLUMN IF NOT EXISTS zoom_max integer DEFAULT 24;
ALTER TABLE public.imagens_raster ALTER COLUMN bbox DROP NOT NULL;
ALTER TABLE public.imagens_raster ALTER COLUMN bbox SET DEFAULT '[]'::jsonb;

-- Só força município obrigatório se não sobrar nenhuma linha antiga sem
-- município (senão o ALTER falharia) — como a importação nunca funcionou
-- de verdade, a tabela deve estar vazia, mas isso cobre o caso de sobrar
-- algo de um teste manual anterior.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.imagens_raster WHERE municipio_id IS NULL) THEN
    ALTER TABLE public.imagens_raster ALTER COLUMN municipio_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.imagens_raster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imagens_raster_select_authenticated ON public.imagens_raster;
CREATE POLICY imagens_raster_select_authenticated ON public.imagens_raster
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS imagens_raster_insert_admin ON public.imagens_raster;
CREATE POLICY imagens_raster_insert_admin ON public.imagens_raster
  FOR INSERT WITH CHECK (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  );

DROP POLICY IF EXISTS imagens_raster_update_admin ON public.imagens_raster;
CREATE POLICY imagens_raster_update_admin ON public.imagens_raster
  FOR UPDATE USING (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  ) WITH CHECK (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  );

DROP POLICY IF EXISTS imagens_raster_delete_admin ON public.imagens_raster;
CREATE POLICY imagens_raster_delete_admin ON public.imagens_raster
  FOR DELETE USING (
    public.is_super_admin() OR public.is_municipio_admin(municipio_id)
  );

-- --- bucket de Storage ------------------------------------------------
-- Público pra leitura (é assim que o L.imageOverlay carrega a imagem
-- direto no navegador via getPublicUrl) — igual ao bucket de assets do
-- app. Escrita (upload/remoção) só pra admin.
INSERT INTO storage.buckets (id, name, public)
VALUES ('rasters', 'rasters', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS rasters_select_public ON storage.objects;
CREATE POLICY rasters_select_public ON storage.objects
  FOR SELECT USING (bucket_id = 'rasters');

DROP POLICY IF EXISTS rasters_insert_admin ON storage.objects;
CREATE POLICY rasters_insert_admin ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'rasters'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
      )
    )
  );

DROP POLICY IF EXISTS rasters_delete_admin ON storage.objects;
CREATE POLICY rasters_delete_admin ON storage.objects
  FOR DELETE USING (
    bucket_id = 'rasters'
    AND (
      public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado'
      )
    )
  );
