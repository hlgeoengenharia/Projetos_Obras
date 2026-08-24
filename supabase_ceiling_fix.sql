-- ============================================================
-- TETO DE PERMISSÃO PRO ADMIN DE ENTE: "quem vê mais pode ver menos,
-- quem vê menos não pode ver mais"
-- Execute no SQL Editor do Supabase, DEPOIS de supabase_permissoes_aba_fix.sql
-- (usa a tabela permissoes_aba criada lá).
-- ============================================================
-- super_admin e admin de MUNICÍPIO sempre enxergam tudo (bypass em
-- is_super_admin()/is_municipio_admin()), então pra eles não existe teto —
-- podem conceder o que quiserem. Admin de ENTE é diferente: ele mesmo está
-- sujeito a permissoes_aba/permissoes_camada como qualquer usuário comum
-- (não bypassa nada). A tela em home.html (Solicitações) e settings.html
-- (Usuários) agora deixam um admin de ente conceder aba/camada pra colegas
-- do mesmo ente — mas só até o limite do que ELE MESMO já tem. Sem essa
-- trava aqui, alguém poderia manipular a chamada no navegador e conceder
-- mais do que devia; a tela só esconde os checkboxes, quem garante de
-- verdade é o RLS abaixo.

-- --- permissoes_aba --------------------------------------------------
DROP POLICY IF EXISTS permissoes_aba_insert_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_insert_admin ON public.permissoes_aba
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_aba.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_aba.pode_ver OR EXISTS (
        SELECT 1 FROM public.permissoes_aba mine
        WHERE mine.user_id = auth.uid() AND mine.form_id = permissoes_aba.form_id
          AND mine.tab_id = permissoes_aba.tab_id AND mine.pode_ver
      ))
      AND (NOT permissoes_aba.pode_editar OR EXISTS (
        SELECT 1 FROM public.permissoes_aba mine
        WHERE mine.user_id = auth.uid() AND mine.form_id = permissoes_aba.form_id
          AND mine.tab_id = permissoes_aba.tab_id AND mine.pode_editar
      ))
    )
  );

DROP POLICY IF EXISTS permissoes_aba_update_admin ON public.permissoes_aba;
CREATE POLICY permissoes_aba_update_admin ON public.permissoes_aba
  FOR UPDATE USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = permissoes_aba.user_id
        AND public.is_entidade_admin_for(mm.entidade)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.temas t
      WHERE t.tipo_cadastro = permissoes_aba.form_id::text
        AND public.is_municipio_admin(t.municipio_id)
    )
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_aba.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_aba.pode_ver OR EXISTS (
        SELECT 1 FROM public.permissoes_aba mine
        WHERE mine.user_id = auth.uid() AND mine.form_id = permissoes_aba.form_id
          AND mine.tab_id = permissoes_aba.tab_id AND mine.pode_ver
      ))
      AND (NOT permissoes_aba.pode_editar OR EXISTS (
        SELECT 1 FROM public.permissoes_aba mine
        WHERE mine.user_id = auth.uid() AND mine.form_id = permissoes_aba.form_id
          AND mine.tab_id = permissoes_aba.tab_id AND mine.pode_editar
      ))
    )
  );

-- --- permissoes_camada: admin de ente também concede acesso à camada
-- (pode_ver/pode_editar/pode_excluir), com o mesmo teto ---------------
DROP POLICY IF EXISTS permissoes_insert_admin ON public.permissoes_camada;
CREATE POLICY permissoes_insert_admin ON public.permissoes_camada
  FOR INSERT WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_camada.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_camada.pode_ver OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_ver
      ))
      AND (NOT permissoes_camada.pode_editar OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_editar
      ))
      AND (NOT permissoes_camada.pode_excluir OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_excluir
      ))
    )
  );

DROP POLICY IF EXISTS permissoes_update_admin ON public.permissoes_camada;
CREATE POLICY permissoes_update_admin ON public.permissoes_camada
  FOR UPDATE USING (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR EXISTS (
      SELECT 1 FROM public.municipio_membros mm
      WHERE mm.user_id = permissoes_camada.user_id
        AND public.is_entidade_admin_for(mm.entidade)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR public.is_municipio_admin((SELECT municipio_id FROM public.temas WHERE id = theme_id))
    OR (
      EXISTS (
        SELECT 1 FROM public.municipio_membros mm
        WHERE mm.user_id = permissoes_camada.user_id
          AND public.is_entidade_admin_for(mm.entidade)
      )
      AND (NOT permissoes_camada.pode_ver OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_ver
      ))
      AND (NOT permissoes_camada.pode_editar OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_editar
      ))
      AND (NOT permissoes_camada.pode_excluir OR EXISTS (
        SELECT 1 FROM public.permissoes_camada mine
        WHERE mine.user_id = auth.uid() AND mine.theme_id = permissoes_camada.theme_id AND mine.pode_excluir
      ))
    )
  );

-- SELECT de permissoes_camada já é "user_id = auth.uid() OR is_admin()"
-- (supabase_auth_setup.sql) — admin de ente também precisa enxergar suas
-- PRÓPRIAS linhas pra calcular o teto (já cai na primeira condição,
-- então nenhuma mudança necessária ali).
