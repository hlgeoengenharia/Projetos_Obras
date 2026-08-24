-- ============================================================
-- SUPORTE A MÚLTIPLOS MUNICÍPIOS NO CADASTRO
-- Execute no SQL Editor do Supabase.
-- ============================================================
-- Até aqui o cadastro (signup.html) só permitia escolher UM município por
-- vez (raw_user_meta_data->>'municipio_id'). Órgãos externos (MPF, PF, SPU)
-- podem precisar de acesso a vários municípios desde o início. O cadastro
-- agora manda uma lista (raw_user_meta_data->'municipio_ids', um array
-- JSON de UUIDs) e o gatilho cria uma linha 'pendente' em
-- municipio_membros para cada um.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_municipio_id uuid;
BEGIN
  INSERT INTO public.profiles (id, nome, email, papel)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email, 'visualizador');

  FOR v_municipio_id IN
    SELECT (elem)::uuid
    FROM jsonb_array_elements_text(COALESCE(NEW.raw_user_meta_data->'municipio_ids', '[]'::jsonb)) AS elem
  LOOP
    INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
    VALUES (
      NEW.id,
      v_municipio_id,
      NEW.raw_user_meta_data->>'entidade',
      NEW.raw_user_meta_data->>'cargo',
      'pendente'
    )
    ON CONFLICT (user_id, municipio_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;
