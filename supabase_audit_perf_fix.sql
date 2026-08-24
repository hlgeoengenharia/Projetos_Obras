-- ============================================================
-- CORREÇÃO: exclusão de tema com muitas feições estourava timeout (57014)
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Causa: trg_feicoes_audit era "FOR EACH ROW" — ao apagar um tema com
-- 20 mil+ feições, o gatilho rodava 20 mil vezes na mesma transação, cada
-- vez serializando a linha inteira (incluindo geometria) em JSON e
-- inserindo em audit_log. Uma exclusão em massa que seria rápida sem
-- gatilho nenhum virou 20 mil operações individuais.
--
-- Correção: trigger "FOR EACH STATEMENT" com transition tables — processa
-- TODAS as linhas afetadas por uma instrução de uma vez só (um INSERT ...
-- SELECT em audit_log), não uma linha de cada vez. Mesmo resultado de
-- auditoria, ordens de magnitude mais rápido em operações em massa.

DROP TRIGGER IF EXISTS trg_feicoes_audit ON public.feicoes;
DROP FUNCTION IF EXISTS public.feicoes_audit();

CREATE OR REPLACE FUNCTION public.feicoes_audit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_depois)
  SELECT auth.uid(), 'feicoes', n.id, 'insert', to_jsonb(n)
  FROM new_rows n;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_feicoes_audit_insert ON public.feicoes;
CREATE TRIGGER trg_feicoes_audit_insert
  AFTER INSERT ON public.feicoes
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.feicoes_audit_insert();

CREATE OR REPLACE FUNCTION public.feicoes_audit_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_antes, dados_depois)
  SELECT
    auth.uid(), 'feicoes', n.id,
    CASE WHEN n.deletado_em IS DISTINCT FROM o.deletado_em AND n.deletado_em IS NOT NULL
         THEN 'delete' ELSE 'update' END,
    to_jsonb(o), to_jsonb(n)
  FROM new_rows n JOIN old_rows o ON o.id = n.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_feicoes_audit_update ON public.feicoes;
CREATE TRIGGER trg_feicoes_audit_update
  AFTER UPDATE ON public.feicoes
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.feicoes_audit_update();

CREATE OR REPLACE FUNCTION public.feicoes_audit_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(user_id, tabela, registro_id, acao, dados_antes)
  SELECT auth.uid(), 'feicoes', o.id, 'delete', to_jsonb(o)
  FROM old_rows o;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_feicoes_audit_delete ON public.feicoes;
CREATE TRIGGER trg_feicoes_audit_delete
  AFTER DELETE ON public.feicoes
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.feicoes_audit_delete();
