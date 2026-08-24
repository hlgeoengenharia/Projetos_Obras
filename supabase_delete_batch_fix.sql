-- ============================================================
-- CORREÇÃO: exclusão em lote pelo cliente (.in('id', [...])) gerava uma
-- URL enorme (milhares de UUIDs) e estourava o limite de tamanho de
-- requisição do servidor (400 Bad Request).
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Correção: a exclusão em lote passa a acontecer DENTRO do banco, via
-- função — o navegador só manda o id do tema e o tamanho do lote (uma
-- URL pequena e fixa, sempre), não importa quantas linhas o lote apague.
-- A verificação de permissão fica embutida na própria função, já que ela
-- roda com privilégio elevado (SECURITY DEFINER) e não passa pelo RLS.

CREATE OR REPLACE FUNCTION public.delete_feicoes_batch(p_theme_id uuid, p_batch_size int DEFAULT 2000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_municipio_id uuid;
  v_deleted int;
BEGIN
  SELECT municipio_id INTO v_municipio_id FROM public.temas WHERE id = p_theme_id;

  IF NOT (public.is_super_admin() OR public.is_municipio_admin(v_municipio_id)) THEN
    RAISE EXCEPTION 'Sem permissão para excluir feições deste tema';
  END IF;

  WITH del AS (
    DELETE FROM public.feicoes
    WHERE id IN (
      SELECT id FROM public.feicoes WHERE theme_id = p_theme_id LIMIT p_batch_size
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_feicoes_batch(uuid, int) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_feicoes_batch(uuid, int) TO authenticated;
