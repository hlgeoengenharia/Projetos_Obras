-- ============================================================
-- SCRIPT DE ENTIDADES PADRÃO — FASE 3c
-- Execute no SQL Editor do Supabase depois de supabase_municipios_setup.sql
-- ============================================================

-- Lista fechada de entidades que aparece no cadastro (signup.html) — em vez
-- de texto livre, padroniza MPF/PF/SPU/Municipal/Outros e permite adicionar
-- novas entidades depois (pela tela em home.html) sem editar código.
CREATE TABLE IF NOT EXISTS public.entidades_padrao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  sigla text,
  tipo text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('municipal', 'externo', 'outro')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entidades_padrao ENABLE ROW LEVEL SECURITY;

-- Leitura pública de propósito: signup.html lista as entidades ANTES de
-- existir sessão, igual municipios.
DROP POLICY IF EXISTS entidades_select_public ON public.entidades_padrao;
CREATE POLICY entidades_select_public ON public.entidades_padrao
  FOR SELECT USING (true);

-- Escrita só pro super_admin — é uma lista da PLATAFORMA (vale pra todos os
-- municípios), não algo que um admin de município deva mexer.
DROP POLICY IF EXISTS entidades_insert_super_admin ON public.entidades_padrao;
CREATE POLICY entidades_insert_super_admin ON public.entidades_padrao
  FOR INSERT WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS entidades_update_super_admin ON public.entidades_padrao;
CREATE POLICY entidades_update_super_admin ON public.entidades_padrao
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS entidades_delete_super_admin ON public.entidades_padrao;
CREATE POLICY entidades_delete_super_admin ON public.entidades_padrao
  FOR DELETE USING (public.is_super_admin());

-- Semente inicial — só insere se a tabela ainda estiver vazia (seguro rodar
-- o script de novo sem duplicar).
INSERT INTO public.entidades_padrao (nome, sigla, tipo)
SELECT * FROM (VALUES
  ('Prefeitura Municipal', 'Municipal', 'municipal'),
  ('Ministério Público Federal', 'MPF', 'externo'),
  ('Polícia Federal', 'PF', 'externo'),
  ('Superintendência do Patrimônio da União', 'SPU', 'externo'),
  ('Outros', 'Outros', 'outro')
) AS seed(nome, sigla, tipo)
WHERE NOT EXISTS (SELECT 1 FROM public.entidades_padrao);
