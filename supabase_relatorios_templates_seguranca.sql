-- ==============================================================================
-- RELATÓRIOS A4: FECHAR O ACESSO ANÔNIMO À TABELA relatorios_templates
-- ==============================================================================
-- Antes: qualquer pessoa com a chave pública do app (papel "anon", sem login)
-- podia ler, criar, alterar e apagar modelos de relatório pela API.
-- Depois: só usuário autenticado (logado) acessa a tabela.
--
-- O que NÃO muda: qualquer usuário logado ainda enxerga e altera qualquer modelo.
-- Separar por ente exigiria uma coluna de dono/ente na tabela (próxima rodada).
--
-- Pode ser executado mais de uma vez. Para desfazer, rode o bloco "DESFAZER" abaixo.
-- ==============================================================================

DROP POLICY IF EXISTS "Permitir leitura de templates para usuarios autenticados" ON public.relatorios_templates;
DROP POLICY IF EXISTS "Permitir gerenciamento de templates" ON public.relatorios_templates;
DROP POLICY IF EXISTS relatorios_templates_select_autenticado ON public.relatorios_templates;
DROP POLICY IF EXISTS relatorios_templates_escrita_autenticado ON public.relatorios_templates;

CREATE POLICY relatorios_templates_select_autenticado ON public.relatorios_templates
    FOR SELECT TO authenticated USING (true);

CREATE POLICY relatorios_templates_escrita_autenticado ON public.relatorios_templates
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.relatorios_templates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios_templates TO authenticated;

-- ------------------------------------------------------------------------------
-- VERIFICAÇÃO (deve listar só "authenticated"; nenhuma linha com "anon"):
--   SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'relatorios_templates';
--
-- DESFAZER (volta ao comportamento anterior, aberto ao anônimo):
--   DROP POLICY IF EXISTS relatorios_templates_select_autenticado ON public.relatorios_templates;
--   DROP POLICY IF EXISTS relatorios_templates_escrita_autenticado ON public.relatorios_templates;
--   CREATE POLICY "Permitir leitura de templates para usuarios autenticados" ON public.relatorios_templates FOR SELECT TO authenticated, anon USING (true);
--   CREATE POLICY "Permitir gerenciamento de templates" ON public.relatorios_templates FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
--   GRANT ALL ON public.relatorios_templates TO anon;
-- ------------------------------------------------------------------------------
