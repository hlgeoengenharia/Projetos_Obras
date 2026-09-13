-- ==============================================================================
-- SISTEMA DE HIERARQUIA: UNIDADE, SETOR E DELEGAÇÃO DE CRIAÇÃO DE CAMADAS
-- Totalmente retrocompatível: utiliza IF NOT EXISTS e valores padrão seguros.
-- ==============================================================================

-- 1. Campos de Unidade, Setor e Delegações na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unidade_admin boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pode_criar_camadas boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pode_subir_ortofotos boolean DEFAULT false;

-- 2. Campos de Unidade e Autor em temas (camadas vetoriais)
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS unidade text;
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS setor text;
ALTER TABLE public.temas ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES auth.users(id);

-- 3. Comentários para documentação do esquema
COMMENT ON COLUMN public.profiles.unidade IS 'Unidade administrativa do servidor dentro do ente (ex: Gerência Regional, Diretoria de Obras)';
COMMENT ON COLUMN public.profiles.setor IS 'Setor específico de atuação do servidor (ex: Fiscalização, Cartografia, Gabinete)';
COMMENT ON COLUMN public.profiles.unidade_admin IS 'Indica se o servidor é o Administrador titular da sua Unidade';
COMMENT ON COLUMN public.profiles.pode_criar_camadas IS 'Autorização delegada pelo Admin para criar/importar novas camadas vetoriais';
COMMENT ON COLUMN public.profiles.pode_subir_ortofotos IS 'Autorização delegada pelo Admin para carregar ortofotos/rasters';

-- 4. Políticas RLS: Delegação de Criação de Camadas Vetoriais (temas)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'temas') THEN
    DROP POLICY IF EXISTS temas_insert_delegados ON public.temas;
    CREATE POLICY temas_insert_delegados ON public.temas
      FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.super_admin = true OR p.pode_criar_camadas = true))
          OR EXISTS (SELECT 1 FROM public.municipio_membros mm WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado')
        )
      );
  END IF;
END $$;

-- 5. Políticas RLS: Delegação de Upload e Cadastro de Ortofotos (storage e imagens_raster)
DO $$
BEGIN
  -- Storage rasters insert
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects') THEN
    DROP POLICY IF EXISTS rasters_insert_admin ON storage.objects;
    CREATE POLICY rasters_insert_admin ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = 'rasters'
        AND (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.super_admin = true OR p.pode_subir_ortofotos = true))
          OR EXISTS (SELECT 1 FROM public.municipio_membros mm WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado')
        )
      );
  END IF;

  -- Tabela imagens_raster insert
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'imagens_raster') THEN
    DROP POLICY IF EXISTS imagens_raster_insert_delegados ON public.imagens_raster;
    CREATE POLICY imagens_raster_insert_delegados ON public.imagens_raster
      FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND (
          EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND (p.super_admin = true OR p.pode_subir_ortofotos = true))
          OR EXISTS (SELECT 1 FROM public.municipio_membros mm WHERE mm.user_id = auth.uid() AND mm.papel = 'admin' AND mm.status = 'aprovado')
        )
      );
  END IF;
END $$;
