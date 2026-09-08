-- ==============================================================================
-- SETUP: COLUNAS DE LOCALIZAÇÃO E CENTRALIZAÇÃO ESPACIAL POR MUNICÍPIO
-- ==============================================================================

-- 1. Adiciona colunas para centralização e enquadramento urbano por município
ALTER TABLE public.municipios ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.municipios ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.municipios ADD COLUMN IF NOT EXISTS zoom integer DEFAULT 15;
ALTER TABLE public.municipios ADD COLUMN IF NOT EXISTS bbox jsonb;

-- 2. Atualiza o município de Cabedelo com suas coordenadas padrão da área urbana
UPDATE public.municipios 
SET latitude = -7.0182, longitude = -34.8336, zoom = 16 
WHERE (LOWER(nome) LIKE '%cabedelo%') AND (latitude IS NULL OR longitude IS NULL);

COMMENT ON COLUMN public.municipios.latitude IS 'Latitude central da área urbana do município';
COMMENT ON COLUMN public.municipios.longitude IS 'Longitude central da área urbana do município';
COMMENT ON COLUMN public.municipios.zoom IS 'Nível inicial de zoom cartográfico para o município';
