-- ==============================================================================
-- MIGRAÇÃO: ADIÇÃO DE METADADOS (OBSERVAÇÃO E LINK DO ANEXO) NAS ORTOFOTOS
-- Tabela: imagens_raster
-- ==============================================================================

-- 1. Adiciona coluna para descrição, justificativa e órgão solicitante
ALTER TABLE public.imagens_raster 
ADD COLUMN IF NOT EXISTS observacao TEXT;

-- 2. Adiciona coluna para link externo do documento de demanda / comprobatório (SEI, Drive, etc.)
ALTER TABLE public.imagens_raster 
ADD COLUMN IF NOT EXISTS anexo_url TEXT;

-- Comentários documentais nas colunas
COMMENT ON COLUMN public.imagens_raster.observacao IS 'Observações institucionais da ortofoto: quem gerou, finalidade, órgão solicitante e demanda.';
COMMENT ON COLUMN public.imagens_raster.anexo_url IS 'URL externa do documento anexo comprobatório (ex: processo SEI, termo, edital ou drive).';
