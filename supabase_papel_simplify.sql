-- ============================================================
-- SIMPLIFICAÇÃO DO NÍVEL DE ACESSO: 4 papéis → 3
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Editor e Visualizador sempre se comportaram exatamente igual — nenhuma
-- função (tem_permissao, userCanOnTheme) jamais distinguiu os dois; ambos
-- sempre caíram na mesma checagem fina de permissoes_camada/permissoes_aba.
-- As telas não oferecem mais "Editor" como opção; isso só normaliza quem
-- já tinha esse valor salvo, pra tudo ficar consistente com "Usuário"
-- (que no banco continua sendo o valor 'visualizador' — só o rótulo na
-- tela mudou).

UPDATE public.municipio_membros SET papel = 'visualizador' WHERE papel = 'editor';
