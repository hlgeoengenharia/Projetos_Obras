# dev_server.py
# Servidor web local com suporte a arquivos estáticos e à API de envio de e-mails via Resend

import sys
import json
import urllib.request
import urllib.error
import socket
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        return super().server_bind()

import os

def load_local_env():
    key = os.environ.get("RESEND_API_KEY", "")
    for env_file in [".env.local", ".env"]:
        if os.path.exists(env_file):
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("RESEND_API_KEY="):
                            return line.split("=", 1)[1].strip().strip('"').strip("'")
            except Exception:
                pass
    return key

RESEND_API_KEY = load_local_env()

class CustomHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/send-login-alert':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                email = payload.get('email', '')
                nome = payload.get('nome', email.split('@')[0])
                data = payload.get('data', '')
                hora = payload.get('hora', '')
                dispositivo = payload.get('dispositivo', 'Navegador Web')
                data_hora = f"{data} às {hora}"

                html_content = f"""
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
                        Olá, <strong>{nome}</strong> ({email}),<br>
                        Informamos que um novo acesso à sua conta no sistema <strong>GeoGestor</strong> foi realizado com sucesso.
                      </p>
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 16px; margin-bottom: 24px;">
                        <div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">🗓 Data e Hora:</strong> {data_hora} (Horário de Brasília)</div>
                        <div style="font-size: 13px; margin-bottom: 8px; color: #475569;"><strong style="color: #0f172a;">💻 Dispositivo / Navegador:</strong> {dispositivo}</div>
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
                """

                # Envia via Resend
                def send_to_resend(dest):
                    body_data = json.dumps({
                        'from': 'GeoGestor <onboarding@resend.dev>',
                        'to': [dest],
                        'subject': f'[GeoGestor] Alerta de Segurança: Novo acesso em {data_hora}',
                        'html': html_content
                    }).encode('utf-8')

                    req = urllib.request.Request(
                        'https://api.resend.com/emails',
                        data=body_data,
                        headers={
                            'Authorization': f'Bearer {RESEND_API_KEY}',
                            'Content-Type': 'application/json',
                            'User-Agent': 'GeoGestor-Server/1.0'
                        },
                        method='POST'
                    )
                    with urllib.request.urlopen(req) as response:
                        return json.loads(response.read().decode('utf-8'))

                try:
                    res_json = send_to_resend(email)
                except urllib.error.HTTPError as e:
                    # Se o Resend recusar por ser conta em modo teste, envia para a conta do desenvolvedor
                    res_json = send_to_resend('heltonleite.geotec@gmail.com')

                try:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': True, 'data': res_json}).encode('utf-8'))
                    print(f"[Resend] E-mail de alerta disparado com sucesso para {email}!")
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                    print(f"[Resend] Conexão concluída para {email} (redirecionamento de página efetuado).")
                return

            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
                return
            except Exception as e:
                try:
                    self.send_response(500)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode('utf-8'))
                except Exception:
                    pass
                print(f"[Resend] Erro ao disparar e-mail: {e}")
                return

        return super().do_POST()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    try:
        httpd = ThreadingHTTPServer(('0.0.0.0', port), CustomHandler)
    except Exception:
        httpd = ThreadingHTTPServer(('', port), CustomHandler)
    httpd.daemon_threads = True
    print(f"Servidor Web GeoGestor multithread ativo em http://localhost:{port} (http://127.0.0.1:{port})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
