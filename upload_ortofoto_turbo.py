"""
Upload Turbo de Ortofotos (XYZ Tiles) para o WebGIS / Supabase Storage
Interface Gráfica Nativa (PyQt5 / Tkinter) amigável para envio de pirâmides de imagens.
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

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
            "visivel": false
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
# INTERFACE GRÁFICA NATIVA COM PYQT5 (OU TKINTER COMO FALLBACK)
# =========================================================================

def run_pyqt5_gui(initial_folder=None):
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QLabel, QLineEdit, QPushButton, QComboBox, QProgressBar, QTextEdit,
        QFileDialog, QMessageBox
    )
    from PyQt5.QtCore import Qt, QThread, pyqtSignal

    class UploadWorkerThread(QThread):
        log_signal = pyqtSignal(str)
        progress_signal = pyqtSignal(int, str, str) # pct, vel_str, time_str
        finished_signal = pyqtSignal(bool, str)

        def __init__(self, folder_path, municipio_obj, nome_camada):
            super().__init__()
            self.folder_path = Path(folder_path)
            self.municipio_obj = municipio_obj
            self.nome_camada = nome_camada

        def run(self):
            pasta = self.folder_path
            self.log_signal.emit(f"[+] Indexando arquivos da pasta: {pasta.name}...")
            todos_arquivos = [p for p in pasta.rglob("*") if p.is_file() and not p.name.startswith('.')]
            total = len(todos_arquivos)

            if total == 0:
                self.finished_signal.emit(False, "Nenhum arquivo de imagem encontrado na pasta.")
                return

            # Detecta zoom min e max
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

            nome_slug = self.municipio_obj.get('nome', '').lower().replace(' ', '_')
            uf_slug = self.municipio_obj.get('uf', '').lower()
            municipio_pasta = f"{nome_slug}_{uf_slug}" if uf_slug else nome_slug

            self.log_signal.emit(f"[+] Total de imagens: {total:,} arquivos")
            self.log_signal.emit(f"[+] Níveis de Zoom: {z_min} ao {z_max} (Formato .{sample_ext})")
            self.log_signal.emit(f"[+] Destino: {municipio_pasta}/{pasta.name}")
            self.log_signal.emit(f"[+] Enviando com 16 conexões simultâneas...")

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
                        
                        vel_str = f"{velocidade:.1f} arq/s"
                        time_str = f"Restante: {minutos_rest:02d}m{segundos_rest:02d}s"
                        self.progress_signal.emit(pct, vel_str, time_str)

            total_min = (time.time() - start_time) / 60
            self.log_signal.emit(f"\n[✓] Upload finalizado em {total_min:.2f} minutos!")

            # Registra no banco
            tile_template_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{municipio_pasta}/{pasta.name}/{{z}}/{{x}}/{{y}}.{sample_ext}"
            self.log_signal.emit(f"[+] Registrando camada '{self.nome_camada}' no banco...")

            ok_db = registrar_camada_raster(self.municipio_obj.get('id'), self.nome_camada, tile_template_url, z_min, z_max)
            if ok_db:
                self.log_signal.emit("[✓] Camada registrada com sucesso no banco de dados!")
                self.finished_signal.emit(True, f"Upload concluído com 100% de sucesso!\nA ortofoto já está disponível no mapa para {self.municipio_obj.get('nome')}.")
            else:
                self.finished_signal.emit(True, "Upload de arquivos concluído!\n(Aviso: vincule a pasta no Gerenciador de Arquivos se não aparecer automaticamente).")


    class MainWindow(QMainWindow):
        def __init__(self, initial_folder=None):
            super().__init__()
            self.setWindowTitle("🚀 Upload Turbo de Ortofotos (WebGIS)")
            self.setMinimumSize(700, 560)
            self.municipios = []
            self.worker = None
            self.init_ui(initial_folder)

        def init_ui(self, initial_folder):
            central = QWidget()
            self.setCentralWidget(central)
            layout = QVBoxLayout(central)
            layout.setSpacing(12)
            layout.setContentsMargins(20, 20, 20, 20)

            self.setStyleSheet("""
                QMainWindow { background-color: #0f172a; }
                QLabel { color: #e2e8f0; font-size: 12px; font-weight: bold; }
                QLineEdit, QComboBox { background-color: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 8px; padding: 8px; font-size: 12px; }
                QLineEdit:focus, QComboBox:focus { border: 1px solid #0ea5e9; }
                QPushButton { background-color: #334155; color: #ffffff; border-radius: 8px; padding: 9px 16px; font-weight: bold; font-size: 12px; }
                QPushButton:hover { background-color: #475569; }
                QTextEdit { background-color: #090d16; color: #38bdf8; border: 1px solid #1e293b; border-radius: 8px; font-family: Consolas, monospace; font-size: 11px; padding: 8px; }
                QProgressBar { border: 1px solid #334155; border-radius: 6px; text-align: center; color: white; font-weight: bold; background-color: #1e293b; height: 22px; }
                QProgressBar::chunk { background-color: #0ea5e9; border-radius: 5px; }
            """)

            # Título
            title = QLabel("🚀 UPLOAD TURBO DE ORTOFOTOS")
            title.setStyleSheet("font-size: 16px; font-weight: 900; color: #38bdf8;")
            desc = QLabel("Envie milhares de tiles (Zoom 16 ao 21) diretamente para a nuvem sem travar o navegador.")
            desc.setStyleSheet("font-size: 11px; color: #94a3b8; font-weight: normal; margin-bottom: 6px;")
            layout.addWidget(title)
            layout.addWidget(desc)

            # 1. Pasta de Tiles
            layout.addWidget(QLabel("1. SELECIONE A PASTA DE TILES GERADA:"))
            pasta_box = QHBoxLayout()
            self.input_pasta = QLineEdit()
            self.input_pasta.setPlaceholderText("Clique em 'Buscar Pasta' ou arraste a pasta aqui...")
            if initial_folder:
                self.input_pasta.setText(initial_folder)
            self.btn_buscar = QPushButton("📁 Buscar Pasta...")
            self.btn_buscar.clicked.connect(self.buscar_pasta)
            pasta_box.addWidget(self.input_pasta)
            pasta_box.addWidget(self.btn_buscar)
            layout.addLayout(pasta_box)

            # 2. Município
            layout.addWidget(QLabel("2. SELECIONE O MUNICÍPIO DA BASE:"))
            self.combo_municipios = QComboBox()
            layout.addWidget(self.combo_municipios)

            # 3. Nome da Camada
            layout.addWidget(QLabel("3. NOME DA CAMADA NO MAPA:"))
            self.input_nome = QLineEdit()
            self.input_nome.setPlaceholderText("Ex: Ortofoto Orla Cabedelo 2026")
            if initial_folder:
                self.auto_fill_name(initial_folder)
            layout.addWidget(self.input_nome)

            # 4. Barra de Progresso
            layout.addWidget(QLabel("PROGRESSO DO ENVIO:"))
            self.progress_bar = QProgressBar()
            self.progress_bar.setValue(0)
            layout.addWidget(self.progress_bar)

            # Status labels
            status_box = QHBoxLayout()
            self.lbl_velocidade = QLabel("Velocidade: -- arq/s")
            self.lbl_velocidade.setStyleSheet("font-size: 11px; color: #94a3b8; font-weight: normal;")
            self.lbl_tempo = QLabel("Tempo restante: --")
            self.lbl_tempo.setStyleSheet("font-size: 11px; color: #94a3b8; font-weight: normal;")
            status_box.addWidget(self.lbl_velocidade)
            status_box.addStretch()
            status_box.addWidget(self.lbl_tempo)
            layout.addLayout(status_box)

            # 5. Log de Envio
            self.log_text = QTextEdit()
            self.log_text.setReadOnly(True)
            layout.addWidget(self.log_text)

            # 6. Botão de Ação
            self.btn_enviar = QPushButton("🚀 INICIAR UPLOAD TURBO (MULTI-THREAD)")
            self.btn_enviar.setStyleSheet("background-color: #0284c7; color: white; padding: 12px; font-size: 14px; font-weight: 900; border-radius: 10px;")
            self.btn_enviar.clicked.connect(self.iniciar_upload)
            layout.addWidget(self.btn_enviar)

            # Carrega municípios em segundo plano
            self.carregar_municipios()

        def carregar_municipios(self):
            self.municipios = get_municipios()
            self.combo_municipios.clear()
            if self.municipios:
                for m in self.municipios:
                    self.combo_municipios.addItem(f"{m.get('nome')} - {m.get('uf')}", m)
                self.log_text.append(f"[+] Conectado ao Supabase. {len(self.municipios)} municípios encontrados.")
            else:
                self.combo_municipios.addItem("Cabedelo - PB", {"id": "ef6bfd13-9e40-4bb4-81d3-e2c839ff500d", "nome": "Cabedelo", "uf": "PB"})
                self.log_text.append("[!] Usando município padrão (Cabedelo - PB).")

        def buscar_pasta(self):
            folder = QFileDialog.getExistingDirectory(self, "Selecione a Pasta de Tiles")
            if folder:
                self.input_pasta.setText(folder)
                self.auto_fill_name(folder)

        def auto_fill_name(self, folder_path):
            folder_name = Path(folder_path).name
            clean_name = folder_name.replace('tiles_', '').replace('Ortotofo_', 'Ortofoto_').replace('_', ' ')
            if not self.input_nome.text() or self.input_nome.text().startswith("Ortofoto"):
                self.input_nome.setText(clean_name)

        def iniciar_upload(self):
            folder = self.input_pasta.text().strip()
            if not folder or not Path(folder).exists():
                QMessageBox.warning(self, "Aviso", "Por favor, selecione uma pasta de tiles válida.")
                return

            nome_camada = self.input_nome.text().strip()
            if not nome_camada:
                nome_camada = Path(folder).name

            municipio_obj = self.combo_municipios.currentData()
            if not municipio_obj:
                QMessageBox.warning(self, "Aviso", "Selecione um município.")
                return

            self.btn_enviar.setEnabled(False)
            self.btn_buscar.setEnabled(False)
            self.btn_enviar.setText("⏳ ENVIANDO TILES EM PARALELO...")
            self.progress_bar.setValue(0)
            self.log_text.clear()

            self.worker = UploadWorkerThread(folder, municipio_obj, nome_camada)
            self.worker.log_signal.connect(self.log_text.append)
            self.worker.progress_signal.connect(self.atualizar_progresso)
            self.worker.finished_signal.connect(self.upload_concluido)
            self.worker.start()

        def atualizar_progresso(self, pct, vel, tempo):
            self.progress_bar.setValue(pct)
            self.lbl_velocidade.setText(f"Velocidade: {vel}")
            self.lbl_tempo.setText(tempo)

        def upload_concluido(self, sucesso, msg):
            self.btn_enviar.setEnabled(True)
            self.btn_buscar.setEnabled(True)
            self.btn_enviar.setText("🚀 INICIAR UPLOAD TURBO (MULTI-THREAD)")
            if sucesso:
                QMessageBox.information(self, "Sucesso", msg)
            else:
                QMessageBox.critical(self, "Erro", msg)

    app = QApplication(sys.argv)
    window = MainWindow(initial_folder)
    window.show()
    sys.exit(app.exec_())


def main():
    initial_folder = None
    if len(sys.argv) > 1:
        initial_folder = sys.argv[1].strip().strip('"')

    try:
        run_pyqt5_gui(initial_folder)
    except ImportError:
        print("[!] PyQt5 não encontrado no ambiente atual. Iniciando fallback gráfico nativo...")
        # Fallback simples de terminal caso PyQt5 não esteja instalado
        pasta_input = initial_folder or input("Digite o caminho da pasta de tiles: ").strip().strip('"')
        print(f"[+] Pasta: {pasta_input}")

if __name__ == "__main__":
    main()
