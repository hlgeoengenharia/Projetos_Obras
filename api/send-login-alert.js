// api/send-login-alert.js
// Vercel Serverless Function para envio de Alertas de Login via Resend

export default async function handler(req, res) {
  // Configuração de CORS para requisições do front-end
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  try {
    const { email, nome, data, hora, dispositivo } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: 'E-mail do usuário não fornecido.' });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'RESEND_API_KEY não configurada nas variáveis de ambiente da Vercel.' });
    }
    const userName = nome || email.split('@')[0];
    const dataHoraStr = `${data || new Date().toLocaleDateString('pt-BR')} às ${hora || new Date().toLocaleTimeString('pt-BR')}`;
    const deviceStr = dispositivo || 'Dispositivo Web';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head><meta charset="utf-8"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 30px 15px; color: #1e293b;">
        <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <div style="background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px;">GeoGestor</h1>
            <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Sistema de Gestão Territorial</p>
          </div>
          <div style="padding: 28px 24px;">
            <div style="margin-bottom: 16px;">
              <span style="font-size: 16px; font-weight: 700; color: #0f172a;">Alerta de Segurança: Novo Login Detectado</span>
            </div>
            <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 20px;">
              Olá, <strong>${userName}</strong> (<span style="color: #64748b;">${email}</span>),<br>
              Informamos que um novo acesso à sua conta no sistema <strong>GeoGestor</strong> foi realizado com sucesso.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 16px; margin-bottom: 24px;">
              <div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">🗓 Data e Hora:</strong> ${dataHoraStr} (Horário de Brasília)</div>
              <div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">💻 Dispositivo / Navegador:</strong> ${deviceStr}</div>
              <div style="font-size: 13px; color: #475569;"><strong style="color: #0f172a;">📍 Status:</strong> Autenticado com sucesso</div>
            </div>
            <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin-bottom: 24px;">
              Se foi você quem realizou este acesso, nenhuma providência adicional é necessária.
            </p>
            <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 14px 16px; border-radius: 4px 8px 8px 4px; margin-bottom: 24px;">
              <div style="font-size: 13px; font-weight: 700; color: #9a3412; margin-bottom: 4px;">Não reconhece este acesso?</div>
              <div style="font-size: 12px; line-height: 1.5; color: #c2410c;">
                Recomendamos alterar sua senha imediatamente na tela de login através de "Esqueci minha senha" para proteger sua conta e comunicar a administração do órgão.
              </div>
            </div>
            <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #94a3b8;">
              Esta é uma mensagem automática de segurança da informação do GeoGestor.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Tenta enviar para o email do usuário
    let response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GeoGestor <onboarding@resend.dev>',
        to: [email],
        subject: `[GeoGestor] Alerta de Segurança: Novo acesso em ${dataHoraStr}`,
        html: htmlContent,
      }),
    });

    let dataRes = await response.json();

    // Se o Resend rejeitar porque o email não é o da conta de teste, envia para a conta principal com aviso
    if (dataRes.statusCode === 403 && dataRes.message && dataRes.message.includes('own email address')) {
      const fallbackResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'GeoGestor <onboarding@resend.dev>',
          to: ['heltonleite.geotec@gmail.com'],
          subject: `[GeoGestor - Teste] Novo acesso de ${email} em ${dataHoraStr}`,
          html: `<p style="background: #e0f2fe; padding: 10px; border-radius: 8px; font-size: 12px; color: #0369a1;"><strong>Modo de Teste Resend:</strong> Alerta gerado para o usuário <strong>${email}</strong> entregue na conta do desenvolvedor.</p>` + htmlContent,
        }),
      });
      dataRes = await fallbackResponse.json();
    }

    return res.status(200).json({ success: true, data: dataRes });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
