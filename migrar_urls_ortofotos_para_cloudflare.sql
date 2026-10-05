-- ==============================================================================
-- 🚀 MIGRAÇÃO DE URLS DE ORTOFOTOS: SUPABASE STORAGE -> CLOUDFLARE R2
-- ==============================================================================
-- Atualiza todas as camadas de ortofoto registradas para usar a CDN de alta
-- velocidade da Cloudflare com Custo Zero de Egress (Download).

UPDATE public.imagens_raster
SET url_imagem = REPLACE(
    url_imagem,
    'https://iqejynikmeroiqyigsjo.supabase.co/storage/v1/object/public/obras_arquivos/',
    'https://ortofotos-tiles.heltonleite-geotec.workers.dev/'
)
WHERE url_imagem LIKE '%supabase.co/storage/v1/object/public/obras_arquivos/%';

-- Conferência das camadas atualizadas:
SELECT id, nome, url_imagem, tipo, zoom_min, zoom_max, entidade, created_at
FROM public.imagens_raster
ORDER BY created_at DESC;
