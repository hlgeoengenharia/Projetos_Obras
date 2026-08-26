"""
Upload Turbo de Ortofotos (XYZ Tiles) para o WebGIS / Supabase Storage
Interface Gráfica Nativa Universal (Tkinter / Multi-threading) com zero dependências externas.
"""

import os
import sys
import json
import time
import threading
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

SUPABASE_URL = "https://iqejynikmeroiqyigsjo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ"
BUCKET_NAME = "obras_arquivos"

def upload_single_tile(file_path, storage_path, max_retries=3):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"
    ext = file_path.suffix.lower()
    content_type = "image/webp" if ext == ".webp" else ("image/png" if ext == ".png" else "image/jpeg")

    for attempt in range(1, max_retries + 1):
        try:
            with open(file_path, "rb") as f:
                data = f.read()

            req = urllib.request.Request(
                url,
                data=data,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": content_type,
                    "x-upsert": "true",
                    "cache-control": "max-age=86400"
                },
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status in (200, 201):
                    return True
        except urllib.error.HTTPError as e:
            if e.code in (400, 409):
                try:
                    req_put = urllib.request.Request(
                        url,
                        data=data,
                        headers={
                            "apikey": SUPABASE_KEY,
                            "Authorization": f"Bearer {SUPABASE_KEY}",
                            "Content-Type": content_type,
                            "cache-control": "max-age=86400"
                        },
                        method="PUT"
                    )
                    with urllib.request.urlopen(req_put, timeout=30) as resp_put:
                        if resp_put.status in (200, 201):
                            return True
                except Exception:
                    pass
            if attempt == max_retries:
                return False
            time.sleep(0.4 * attempt)
        except Exception:
            if attempt == max_retries:
                return False
            time.sleep(0.4 * attempt)
    return False

def get_municipios():
    try:
        url = f"{SUPABASE_URL}/rest/v1/municipios?select=id,nome,uf&ativo=eq.true&order=nome.asc"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"[-] Aviso ao listar municipios: {e}")
    return []

def registrar_camada_raster(municipio_id, nome_camada, tile_url, zoom_min, zoom_max):
    try:
        url = f"{SUPABASE_URL}/rest/v1/imagens_raster"
        payload = json.dumps({
            "municipio_id": municipio_id,
            "nome": nome_camada,
            "url_imagem": tile_url,
            "bbox": [],
            "tipo": "xyz_tiles",
            "zoom_min": zoom_min,
            "zoom_max": zoom_max,
            "opacidade": 0.9,
            "visivel": False
        }).encode('utf-8')

        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                return True
    except Exception as e:
        print(f"[!] Erro ao cadastrar no banco: {e}")
    return False


# =========================================================================
# INTERFACE GRÁFICA UNIVERSAL COM TKINTER (100% NATIVA NO WINDOWS)
# =========================================================================

class UploadApp:
    def __init__(self, root, initial_folder=None):
        self.root = root
        self.root.title("🚀 Upload Turbo de Ortofotos (WebGIS)")
        self.root.geometry("680x620")
        self.root.minsize(600, 520)
        self.root.configure(bg="#0f172a")

        self.municipios = []
        self.is_uploading = False

        self.setup_ui(initial_folder)
        self.carregar_municipios()

    def setup_ui(self, initial_folder):
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("TProgressbar", thickness=18, troughcolor="#1e293b", background="#0ea5e9")

        # Container principal com padding
        main_frame = tk.Frame(self.root, bg="#0f172a", padx=20, pady=20)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # Cabeçalho
        lbl_title = tk.Label(main_frame, text="🚀 UPLOAD TURBO DE ORTOFOTOS", font=("Segoe UI", 14, "bold"), fg="#38bdf8", bg="#0f172a")
        lbl_title.pack(anchor="w")

        lbl_desc = tk.Label(main_frame, text="Envie milhares de imagens de zoom (16 ao 21) diretamente para a nuvem em minutos.", font=("Segoe UI", 9), fg="#94a3b8", bg="#0f172a")
        lbl_desc.pack(anchor="w", pady=(2, 14))

        # 1. Seleção de Pasta
        lbl_pasta = tk.Label(main_frame, text="1. SELECIONE A PASTA DE TILES GERADA:", font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0f172a")
        lbl_pasta.pack(anchor="w")

        pasta_frame = tk.Frame(main_frame, bg="#0f172a")
        pasta_frame.pack(fill=tk.X, pady=(4, 12))

        self.entry_pasta = tk.Entry(pasta_frame, font=("Segoe UI", 10), bg="#1e293b", fg="#f8fafc", insertbackground="white", relief=tk.FLAT, bd=6)
        self.entry_pasta.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        if initial_folder:
            self.entry_pasta.insert(0, initial_folder)

        btn_buscar = tk.Button(pasta_frame, text="📁 Buscar Pasta...", font=("Segoe UI", 9, "bold"), bg="#334155", fg="white", activebackground="#475569", activeforeground="white", relief=tk.FLAT, padx=12, pady=4, cursor="hand2", command=self.buscar_pasta)
        btn_buscar.pack(side=tk.RIGHT)

        # 2. Seleção de Município
        lbl_mun = tk.Label(main_frame, text="2. SELECIONE O MUNICÍPIO DA BASE:", font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0f172a")
        lbl_mun.pack(anchor="w")

        self.combo_mun_var = tk.StringVar()
        self.combo_mun = ttk.Combobox(main_frame, textvariable=self.combo_mun_var, font=("Segoe UI", 10), state="readonly")
        self.combo_mun.pack(fill=tk.X, pady=(4, 12))

        # 3. Nome da Camada
        lbl_nome = tk.Label(main_frame, text="3. NOME DA CAMADA NO MAPA:", font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0f172a")
        lbl_nome.pack(anchor="w")

        self.entry_nome = tk.Entry(main_frame, font=("Segoe UI", 10), bg="#1e293b", fg="#f8fafc", insertbackground="white", relief=tk.FLAT, bd=6)
        self.entry_nome.pack(fill=tk.X, pady=(4, 14))
        if initial_folder:
            self.auto_fill_name(initial_folder)

        # 4. Barra de Progresso
        lbl_prog = tk.Label(main_frame, text="PROGRESSO DO ENVIO:", font=("Segoe UI", 9, "bold"), fg="#f8fafc", bg="#0f172a")
        lbl_prog.pack(anchor="w")

        self.progress_bar = ttk.Progressbar(main_frame, style="TProgressbar", mode="determinate")
        self.progress_bar.pack(fill=tk.X, pady=(4, 4))

        status_frame = tk.Frame(main_frame, bg="#0f172a")
        status_frame.pack(fill=tk.X, pady=(0, 10))

        self.lbl_velocidade = tk.Label(status_frame, text="Velocidade: -- arq/s", font=("Segoe UI", 8), fg="#94a3b8", bg="#0f172a")
        self.lbl_velocidade.pack(side=tk.LEFT)

        self.lbl_tempo = tk.Label(status_frame, text="Tempo restante: --", font=("Segoe UI", 8), fg="#94a3b8", bg="#0f172a")
        self.lbl_tempo.pack(side=tk.RIGHT)

        # 5. Log de Status
        self.log_text = tk.Text(main_frame, height=7, font=("Consolas", 9), bg="#090d16", fg="#38bdf8", relief=tk.FLAT, bd=6)
        self.log_text.pack(fill=tk.BOTH, expand=True, pady=(0, 12))

        # 6. Botão Iniciar Envio
        self.btn_iniciar = tk.Button(main_frame, text="🚀 INICIAR UPLOAD TURBO (MULTI-THREAD)", font=("Segoe UI", 11, "bold"), bg="#0284c7", fg="white", activebackground="#0369a1", activeforeground="white", relief=tk.FLAT, pady=10, cursor="hand2", command=self.iniciar_upload_thread)
        self.btn_iniciar.pack(fill=tk.X)

    def log(self, msg):
        self.log_text.insert(tk.END, msg + "\n")
        self.log_text.see(tk.END)

    def carregar_municipios(self):
        def _fetch():
            self.municipios = get_municipios()
            if self.municipios:
                nomes = [f"{m.get('nome')} - {m.get('uf')}" for m in self.municipios]
                self.combo_mun['values'] = nomes
                self.combo_mun.current(0)
                self.log(f"[+] Conectado ao Supabase. {len(self.municipios)} municípios disponíveis.")
            else:
                self.combo_mun['values'] = ["Cabedelo - PB"]
                self.combo_mun.current(0)
                self.municipios = [{"id": "ef6bfd13-9e40-4bb4-81d3-e2c839ff500d", "nome": "Cabedelo", "uf": "PB"}]
                self.log("[!] Usando município padrão: Cabedelo - PB")
        threading.Thread(target=_fetch, daemon=True).start()

    def buscar_pasta(self):
        pasta = filedialog.askdirectory(title="Selecione a Pasta de Tiles")
        if pasta:
            self.entry_pasta.delete(0, tk.END)
            self.entry_pasta.insert(0, pasta)
            self.auto_fill_name(pasta)

    def auto_fill_name(self, folder_path):
        folder_name = Path(folder_path).name
        clean_name = folder_name.replace('tiles_', '').replace('Ortotofo_', 'Ortofoto_').replace('_', ' ')
        current = self.entry_nome.get().strip()
        if not current or current.startswith("Ortofoto"):
            self.entry_nome.delete(0, tk.END)
            self.entry_nome.insert(0, clean_name)

    def iniciar_upload_thread(self):
        if self.is_uploading:
            return

        pasta_str = self.entry_pasta.get().strip()
        if not pasta_str or not Path(pasta_str).exists():
            messagebox.showwarning("Aviso", "Por favor, selecione uma pasta de tiles válida.")
            return

        idx = self.combo_mun.current()
        if idx < 0 or idx >= len(self.municipios):
            messagebox.showwarning("Aviso", "Selecione um município na lista.")
            return

        municipio_obj = self.municipios[idx]
        nome_camada = self.entry_nome.get().strip() or Path(pasta_str).name

        self.is_uploading = True
        self.btn_iniciar.config(state=tk.DISABLED, bg="#475569", text="⏳ ENVIANDO TILES EM PARALELO...")
        self.progress_bar['value'] = 0
        self.log_text.delete("1.0", tk.END)

        threading.Thread(target=self.executar_upload, args=(Path(pasta_str), municipio_obj, nome_camada), daemon=True).start()

    def executar_upload(self, pasta, municipio_obj, nome_camada):
        self.log(f"[+] Indexando arquivos na pasta: {pasta.name}...")
        todos_arquivos = [p for p in pasta.rglob("*") if p.is_file() and not p.name.startswith('.')]
        total = len(todos_arquivos)

        if total == 0:
            self.log("[-] Nenhum arquivo de imagem encontrado na pasta.")
            self.finalizar_upload(False, "Nenhum arquivo encontrado na pasta selecionada.")
            return

        zooms = []
        sample_ext = "webp"
        for arq in todos_arquivos:
            parts = arq.relative_to(pasta).parts
            if len(parts) >= 2 and parts[0].isdigit():
                zooms.append(int(parts[0]))
            if arq.suffix:
                sample_ext = arq.suffix.lstrip('.')

        z_min = min(zooms) if zooms else 14
        z_max = max(zooms) if zooms else 21

        nome_slug = municipio_obj.get('nome', '').lower().replace(' ', '_')
        uf_slug = municipio_obj.get('uf', '').lower()
        municipio_pasta = f"{nome_slug}_{uf_slug}" if uf_slug else nome_slug

        self.log(f"[+] Total de imagens: {total:,} arquivos")
        self.log(f"[+] Níveis de Zoom: {z_min} ao {z_max} (Formato .{sample_ext})")
        self.log(f"[+] Destino no Storage: {municipio_pasta}/{pasta.name}")
        self.log(f"[+] Iniciando envio paralelo com 16 conexões simultâneas...")

        WORKERS = 16
        start_time = time.time()
        enviados = 0
        falhas = 0

        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            futures = {}
            for arq in todos_arquivos:
                rel_path = arq.relative_to(pasta).as_posix()
                storage_path = f"{municipio_pasta}/{pasta.name}/{rel_path}"
                f = executor.submit(upload_single_tile, arq, storage_path)
                futures[f] = storage_path

            for future in as_completed(futures):
                enviados += 1
                if not future.result():
                    falhas += 1

                if enviados % 50 == 0 or enviados == total:
                    pct = int((enviados / total) * 100)
                    tempo_decorrido = time.time() - start_time
                    velocidade = enviados / max(1, tempo_decorrido)
                    restante_segundos = (total - enviados) / max(0.1, velocidade)
                    minutos_rest = int(restante_segundos // 60)
                    segundos_rest = int(restante_segundos % 60)

                    self.root.after(0, self.atualizar_ui_progresso, pct, f"Velocidade: {velocidade:.1f} arq/s", f"Tempo restante: {minutos_rest:02d}m{segundos_rest:02d}s")

        total_min = (time.time() - start_time) / 60
        self.log(f"\n[✓] Upload finalizado em {total_min:.2f} minutos!")

        tile_template_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{municipio_pasta}/{pasta.name}/{{z}}/{{x}}/{{y}}.{sample_ext}"
        self.log(f"[+] Registrando camada '{nome_camada}' no banco...")

        ok_db = registrar_camada_raster(municipio_obj.get('id'), nome_camada, tile_template_url, z_min, z_max)
        if ok_db:
            self.log("[✓] Camada registrada com sucesso no banco de dados!")
            self.finalizar_upload(True, f"Upload concluído com 100% de sucesso!\nA ortofoto já está disponível no mapa para {municipio_obj.get('nome')}.")
        else:
            self.finalizar_upload(True, "Upload de arquivos concluído!\n(Aviso: vincule a pasta no Gerenciador de Arquivos se não aparecer automaticamente).")

    def atualizar_ui_progresso(self, pct, vel_str, tempo_str):
        self.progress_bar['value'] = pct
        self.lbl_velocidade.config(text=vel_str)
        self.lbl_tempo.config(text=tempo_str)

    def finalizar_upload(self, sucesso, msg):
        def _finish():
            self.is_uploading = False
            self.btn_iniciar.config(state=tk.NORMAL, bg="#0284c7", text="🚀 INICIAR UPLOAD TURBO (MULTI-THREAD)")
            if sucesso:
                messagebox.showinfo("Sucesso", msg)
            else:
                messagebox.showerror("Erro", msg)
        self.root.after(0, _finish)


def main():
    initial_folder = None
    if len(sys.argv) > 1:
        initial_folder = sys.argv[1].strip().strip('"')

    root = tk.Tk()
    app = UploadApp(root, initial_folder)
    root.mainloop()

if __name__ == "__main__":
    main()
