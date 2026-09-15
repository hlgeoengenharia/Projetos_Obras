-- ==============================================================================
-- SCRIPT: supabase_resend_email_setup.sql
-- DESCRIÇÃO: Habilita envio de e-mails de alerta de login em tempo real via
--            extensão pg_net do Supabase integrada à API do Resend.
-- ==============================================================================

-- 1. Cria o schema 'net' caso não exista e habilita a extensão pg_net
CREATE SCHEMA IF NOT EXISTS net;

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA net;
EXCEPTION WHEN OTHERS THEN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_net;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
END $$;

-- 2. Função para envio de alerta de login por e-mail via Resend
CREATE OR REPLACE FUNCTION public.send_login_alert(
    user_email TEXT,
    user_nome TEXT DEFAULT 'Usuário',
    user_device TEXT DEFAULT 'Dispositivo Web'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
DECLARE
    -- Substitua 'SUA_CHAVE_RESEND_AQUI' pela sua chave do Resend (iniciada com re_...)
    resend_key TEXT := 'SUA_CHAVE_RESEND_AQUI';
    email_body JSONB;
    request_id BIGINT;
    data_hora TEXT;
    html_content TEXT;
    destinatario TEXT;
BEGIN
    -- Formata data e hora no horário oficial de Brasília
    data_hora := to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
    
    -- Na conta do Resend, envia para o e-mail cadastrado ou fornecido
    destinatario := coalesce(user_email, 'heltonleite.geotec@gmail.com');

    html_content := '<!DOCTYPE html>' ||
      '<html lang="pt-BR"><head><meta charset="utf-8"></head>' ||
      '<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 30px 15px; color: #1e293b;">' ||
      '<div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">' ||
      '<div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 28px 24px; text-align: center; color: #ffffff;">' ||
      '<h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">GeoGestor</h1>' ||
      '<p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Sistema de Gestão Territorial</p>' ||
      '</div>' ||
      '<div style="padding: 28px 24px;">' ||
      '<div style="margin-bottom: 16px;">' ||
      '<span style="font-size: 16px; font-weight: 700; color: #0f172a;">Alerta de Segurança: Novo Login Detectado</span>' ||
      '</div>' ||
      '<p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">' ||
      'Olá, <strong>' || coalesce(user_nome, 'Usuário') || '</strong>,<br>' ||
      'Informamos que um novo acesso à sua conta no sistema <strong>GeoGestor</strong> foi realizado com sucesso.' ||
      '</p>' ||
      '<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 16px; margin-bottom: 24px;">' ||
      '<div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">🗓 Data e Hora:</strong> ' || data_hora || ' (Horário de Brasília)</div>' ||
      '<div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">💻 Dispositivo / Navegador:</strong> ' || coalesce(user_device, 'Navegador Web') || '</div>' ||
      '<div style="font-size: 13px; color: #475569;"><strong style="color: #0f172a;">📍 Status:</strong> Autenticado com sucesso</div>' ||
      '</div>' ||
      '<p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">' ||
      'Se foi você quem realizou este acesso, nenhuma providência adicional é necessária.' ||
      '</p>' ||
      '<div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px 16px; border-radius: 4px 8px 8px 4px; margin-bottom: 24px;">' ||
      '<div style="font-size: 13px; font-weight: 700; color: #9a3412; margin-bottom: 4px;">Não reconhece este acesso?</div>' ||
      '<div style="font-size: 12px; line-height: 1.5; color: #c2410c;">' ||
      'Recomendamos alterar sua senha imediatamente na tela de login através de "Esqueci minha senha" para proteger sua conta e comunicar a administração do órgão.' ||
      '</div>' ||
      '</div>' ||
      '<div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">' ||
      'Esta é uma mensagem automática de segurança da informação do GeoGestor.' ||
      '</div>' ||
      '</div></div></body></html>';

    email_body := jsonb_build_object(
        'from', 'GeoGestor <onboarding@resend.dev>',
        'to', jsonb_build_array(destinatario),
        'subject', '[GeoGestor] Alerta de Segurança: Novo acesso em ' || data_hora,
        'html', html_content
    );

    -- Tenta disparar usando net.http_post ou http_post
    BEGIN
        SELECT net.http_post(
            url := 'https://api.resend.com/emails',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || resend_key,
                'Content-Type', 'application/json'
            ),
            body := email_body
        ) INTO request_id;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            EXECUTE 'SELECT http_post($1, $2, $3)'
            INTO request_id
            USING 'https://api.resend.com/emails',
                  jsonb_build_object('Authorization', 'Bearer ' || resend_key, 'Content-Type', 'application/json')::text,
                  email_body::text;
        EXCEPTION WHEN OTHERS THEN
            request_id := NULL;
        END;
    END;

    RETURN jsonb_build_object(
        'success', true, 
        'request_id', request_id, 
        'recipient', destinatario,
        'data_hora', data_hora
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Permissões de execução
GRANT EXECUTE ON FUNCTION public.send_login_alert TO anon, authenticated, service_role;
