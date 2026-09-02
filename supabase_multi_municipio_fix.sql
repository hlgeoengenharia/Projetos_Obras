-- ============================================================
-- SUPORTE A MÚLTIPLOS MUNICÍPIOS NO CADASTRO + RESGATE DE SOLICITAÇÕES
-- Execute este script completo no SQL Editor do Supabase.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_municipio_id uuid;
BEGIN
  -- 1. Garante criação do perfil
  INSERT INTO public.profiles (id, nome, email, papel)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email, 'visualizador')
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email;

  -- 2. Suporta tanto array (municipio_ids) quanto string única (municipio_id)
  IF jsonb_typeof(NEW.raw_user_meta_data->'municipio_ids') = 'array' THEN
    FOR v_municipio_id IN
      SELECT (elem)::uuid
      FROM jsonb_array_elements_text(NEW.raw_user_meta_data->'municipio_ids') AS elem
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
  ELSIF (NEW.raw_user_meta_data->>'municipio_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'municipio_id') <> '' THEN
    INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'municipio_id')::uuid,
      NEW.raw_user_meta_data->>'entidade',
      NEW.raw_user_meta_data->>'cargo',
      'pendente'
    )
    ON CONFLICT (user_id, municipio_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. RESGATE: Cria o pedido em municipio_membros para qualquer usuário
-- que já se cadastrou recentemente e ficou sem o vínculo
-- ============================================================
INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
SELECT 
  u.id,
  (elem)::uuid,
  COALESCE(u.raw_user_meta_data->>'entidade', 'Não informada'),
  COALESCE(u.raw_user_meta_data->>'cargo', 'Não informado'),
  'pendente'
FROM auth.users u,
     jsonb_array_elements_text(COALESCE(u.raw_user_meta_data->'municipio_ids', '[]'::jsonb)) AS elem
WHERE NOT EXISTS (
  SELECT 1 FROM public.municipio_membros mm 
  WHERE mm.user_id = u.id AND mm.municipio_id = (elem)::uuid
)
ON CONFLICT (user_id, municipio_id) DO NOTHING;

-- Resgate também para quem tiver gravado em formato singular (municipio_id)
INSERT INTO public.municipio_membros (user_id, municipio_id, entidade, cargo, status)
SELECT 
  u.id,
  (u.raw_user_meta_data->>'municipio_id')::uuid,
  COALESCE(u.raw_user_meta_data->>'entidade', 'Não informada'),
  COALESCE(u.raw_user_meta_data->>'cargo', 'Não informado'),
  'pendente'
FROM auth.users u
WHERE u.raw_user_meta_data->>'municipio_id' IS NOT NULL 
  AND u.raw_user_meta_data->>'municipio_id' <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.municipio_membros mm 
    WHERE mm.user_id = u.id AND mm.municipio_id = (u.raw_user_meta_data->>'municipio_id')::uuid
  )
ON CONFLICT (user_id, municipio_id) DO NOTHING;

