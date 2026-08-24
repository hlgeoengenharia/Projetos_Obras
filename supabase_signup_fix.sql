-- ============================================================
-- CORREÇÃO: pedido de acesso falhava com 401 no cadastro
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Causa: supabaseClient.auth.signUp() só devolve uma sessão ativa se a
-- confirmação de e-mail estiver desligada no projeto. Com confirmação
-- ligada (padrão do Supabase), a chamada seguinte pra registrar o pedido
-- em municipio_membros ia sem sessão nenhuma — o RLS corretamente recusava.
--
-- Correção: entidade/cargo/município agora vêm junto no próprio signUp()
-- (em raw_user_meta_data), e quem cria a linha em municipio_membros é o
-- gatilho que já existe (handle_new_user) — ele roda no servidor
-- (SECURITY DEFINER), então não depende de sessão nem de confirmação de
-- e-mail.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_municipio_id uuid;
BEGIN
  INSERT INTO public.profiles (id, nome, email, papel)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email, 'visualizador');

  v_municipio_id := NULLIF(NEW.raw_user_meta_data->>'municipio_id', '')::uuid;
  IF v_municipio_id IS NOT NULL THEN
    INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
    VALUES (
      NEW.id,
      v_municipio_id,
      NEW.raw_user_meta_data->>'entidade',
      NEW.raw_user_meta_data->>'cargo',
      'pendente'
    )
    ON CONFLICT (user_id, municipio_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Conserta o pedido da Ana Laura, que ficou sem o vínculo por causa do bug
-- (troque o município se não for Cabedelo):
-- INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
-- SELECT id, (SELECT id FROM public.municipios WHERE nome = 'Cabedelo'), 'Ministério Público Federal', 'Analista', 'pendente'
-- FROM public.profiles WHERE email = 'analaura.travassos10@gmail.com'
-- ON CONFLICT (user_id, municipio_id) DO NOTHING;
