-- ============================================================
-- HABILITAR SINCRONIZAÇÃO EM TEMPO REAL (SUPABASE REALTIME)
-- Execute no SQL Editor do Supabase para garantir sincronização
-- instantânea entre usuários simultâneos no mapa.
-- ============================================================

-- Garante que as alterações completas (incluindo dados anteriores em updates/deletes) sejam propagadas
ALTER TABLE public.temas REPLICA IDENTITY FULL;
ALTER TABLE public.feicoes REPLICA IDENTITY FULL;

-- Adiciona as tabelas à publicação do Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'temas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.temas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'feicoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feicoes;
  END IF;
END $$;
