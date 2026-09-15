// supabase/functions/send-login-alert/index.ts
// Edge Function do Supabase para Notificação de Login / Alerta de Segurança

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, nome, data, hora, dispositivo } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "E-mail do destinatário obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userName = nome || email.split("@")[0];
    const dataHoraStr = `${data || new Date().toLocaleDateString('pt-BR')} às ${hora || new Date().toLocaleTimeString('pt-BR')}`;
    const deviceStr = dispositivo || "Dispositivo Web / Navegador Autenticado";

    // Template HTML Institucional de Alerta de Login
    const htmlEmail = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Alerta de Segurança - GeoGestor</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 30px 15px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Cabeçalho -->
          <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">GeoGestor</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Sistema de Gestão Territorial</p>
          </div>

          <!-- Conteúdo -->
          <div style="padding: 28px 24px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a;">Alerta de Segurança: Novo Login Detectado</span>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
              Olá, <strong>${userName}</strong>,<br>
              Informamos que um novo acesso à sua conta no sistema <strong>GeoGestor</strong> foi realizado com sucesso.
            </p>

            <!-- Card de Detalhes do Acesso -->
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 16px; margin-bottom: 24px;">
              <div style="font-size: 13px; margin-bottom: 8px; color: #475569;">
                <strong style="color: #0f172a;">🗓 Data e Hora:</strong> ${dataHoraStr} (Horário de Brasília)
              </div>
              <div style="font-size: 13px; margin-bottom: 8px; color: #475569;">
                <strong style="color: #0f172a;">💻 Dispositivo / Navegador:</strong> ${deviceStr}
              </div>
              <div style="font-size: 13px; color: #475569;">
                <strong style="color: #0f172a;">📍 Status do Acesso:</strong> Autenticado com sucesso
              </div>
            </div>

            <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">
              Se foi você quem realizou este acesso, nenhuma providência adicional é necessária.
            </p>

            <!-- Alerta de Segurança -->
            <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px 16px; border-radius: 4px 8px 8px 4px; margin-bottom: 24px;">
              <div style="font-size: 13px; font-weight: 700; color: #9a3412; margin-bottom: 4px;">
                Não reconhece este acesso?
              </div>
              <div style="font-size: 12px; line-height: 1.5; color: #c2410c;">
                Recomendamos que você acesse a página de recuperação de senha do sistema imediatamente para proteger sua conta e comunique a administração do seu órgão.
              </div>
            </div>

            <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
              <span style="font-size: 11px; color: #94a3b8;">
                Esta é uma mensagem automática de segurança da informação gerada pela plataforma GeoGestor.
              </span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // 1. Envio via RESEND se API KEY estiver configurada
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("MAIL_FROM") || "GeoGestor <seguranca@geogestor.gov.br>",
          to: [email],
          subject: `[GeoGestor] Alerta de Segurança: Novo acesso em ${dataHoraStr}`,
          html: htmlEmail,
        }),
      });

      const resData = await res.json();
      return new Response(JSON.stringify({ success: true, provider: "resend", data: resData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se nenhuma chave de provedor foi configurada nas variáveis de ambiente do Supabase:
    return new Response(
      JSON.stringify({
        success: true,
        message: "Notificação gerada com sucesso (configure RESEND_API_KEY nas variáveis da Edge Function para despacho externo)",
        recipient: email,
        dataHora: dataHoraStr
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
