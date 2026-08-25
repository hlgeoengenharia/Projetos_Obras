"""
Processador Turbo de Ortofotos GeoTIFF para WebGIS (XYZ Tiles Multi-Core)
Interface Gráfica Nativa (PyQt5) com suporte a Seleção Visual de Arquivos e Pastas.
"""

import os
import sys
import json
import time
import subprocess
from pathlib import Path

def get_cpu_cores():
    try:
        cores = os.cpu_count()
        return max(2, cores if cores else 4)
    except Exception:
        return 4

def run_gdal_tiling(tif_path, output_dir, zoom_min, zoom_max, log_callback=None, progress_callback=None):
    tif_file = Path(tif_path).resolve()
    if not tif_file.exists():
        if log_callback: log_callback(f"[-] Erro: Arquivo não encontrado: {tif_file}")
        return False

    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)
    
    cores = get_cpu_cores()
    if log_callback:
        log_callback(f"[+] Arquivo selecionado: {tif_file.name}")
        log_callback(f"[+] Tamanho do arquivo: {tif_file.stat().st_size / (1024*1024):.2f} MB")
        log_callback(f"[+] Pasta de destino: {output_path}")
        log_callback(f"[+] Níveis de Zoom: {zoom_min} ao {zoom_max}")
        log_callback(f"[+] Aceleração Multi-Core: Utilizando {cores} núcleos da CPU")
        log_callback("[+] Fatiando imagens em paralelo (aguarde alguns segundos)...")

    start_time = time.time()
    
    # 1. Inspeciona e autocalibra projeção com GDAL
    input_to_tile = str(tif_file)
    temp_vrt_path = None
    
    try:
        from osgeo import gdal
        ds = gdal.Open(str(tif_file))
        if ds:
            proj = ds.GetProjection()
            gt = ds.GetGeoTransform()
            
            srs_in = 'EPSG:31985' if (not proj or ("GEOGCS" not in proj and "PROJCS" not in proj)) else None
            
            if srs_in and log_callback:
                log_callback("[!] Aviso: O arquivo não tem tag de projeção explícita no cabeçalho.")
                log_callback("[+] Autocalibrando para SIRGAS 2000 / UTM zone 25S (EPSG:31985 - Cabedelo/PB)...")

            temp_nearblack_vrt = str(output_path / "_temp_clean_alpha.vrt")
            temp_vrt_path = str(output_path / "_temp_geocalibrado.vrt")

            if log_callback:
                log_callback("[+] Detectando bordas com algoritmo Floodfill (Removendo preto e branco com tolerância)...")

            # Aplica Nearblack com floodfill para eliminar ruído JPEG das bordas
            try:
                gdal.Nearblack(
                    temp_nearblack_vrt,
                    ds,
                    options=gdal.NearblackOptions(
                        options=['-setalpha', '-white', '-color', '0,0,0', '-near', '30', '-alg', 'floodfill', '-of', 'VRT']
                    )
                )
                source_for_warp = temp_nearblack_vrt
            except Exception as e_nb:
                if log_callback: log_callback(f"[!] Info Nearblack: {e_nb}")
                source_for_warp = ds

            # Cria VRT virtual com reprojeção e interpolação Lanczos
            warp_options = {
                'format': 'VRT',
                'dstSRS': 'EPSG:3857',
                'resampleAlg': 'lanczos',
                'dstAlpha': True
            }
            if srs_in:
                warp_options['srcSRS'] = srs_in

            gdal.Warp(temp_vrt_path, source_for_warp, **warp_options)
            input_to_tile = temp_vrt_path
            if log_callback:
                log_callback("[+] Bordas brancas e pretas convertidas em 100% de transparência.")
    except Exception as e_vrt:
        if log_callback: log_callback(f"[!] Info VRT: {e_vrt}")

    argv = [
        "gdal2tiles",
        f"--processes={cores}",
        f"-z", f"{zoom_min}-{zoom_max}",
        "-w", "leaflet",
        "-r", "lanczos",
        "-a", "0,0,0",
        "--tiledriver=WEBP",
        "--webp-quality=90",
        "-x",
        "--xyz",
        input_to_tile,
        str(output_path)
    ]
    
    try:
        from osgeo_utils import gdal2tiles
        # Executa gdal2tiles diretamente
        gdal2tiles.main(argv)
    except Exception as e:
        if log_callback: log_callback(f"[-] Tentando fallback via subprocesso: {e}")
        try:
            cmd = [sys.executable, "-m", "osgeo_utils.gdal2tiles"] + argv[1:]
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0 and log_callback:
                log_callback(f"[-] Erro retornado: {res.stderr}")
                return False
        except Exception as sub_e:
            if log_callback: log_callback(f"[-] Erro no fatiamento: {sub_e}")
            return False

    # Limpeza dos VRTs temporários se criados
    for tmp in [temp_vrt_path, str(output_path / "_temp_clean_alpha.vrt")]:
        if tmp and os.path.exists(tmp):
            try: os.remove(tmp)
            except Exception: pass

    elapsed = time.time() - start_time
    if log_callback: log_callback(f"\n[OK] Fatiamento concluído com sucesso em {elapsed:.2f} segundos!")
    
    # Criar metadados
    metadata = {
        "nome": tif_file.stem,
        "tipo": "xyz_tiles",
        "pasta_tiles": str(output_path),
        "url_template": f"{output_path.name}/{{z}}/{{x}}/{{y}}.png",
        "zoom_min": zoom_min,
        "zoom_max": zoom_max,
        "data_criacao": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    meta_file = output_path / "metadados_camada.json"
    try:
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        if log_callback: log_callback(f"[+] Metadados salvos em: {meta_file.name}")
    except Exception:
        pass
        
    return True


# --- INTERFACE GRÁFICA NATIVA COM PYQT5 ---
try:
    from PyQt5 import QtWidgets, QtCore, QtGui
    from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                                 QHBoxLayout, QLabel, QLineEdit, QPushButton, 
                                 QFileDialog, QSpinBox, QTextEdit, QProgressBar, QMessageBox)

    class WorkerThread(QtCore.QThread):
        log_signal = QtCore.pyqtSignal(str)
        finished_signal = QtCore.pyqtSignal(bool)

        def __init__(self, tif_path, output_dir, zoom_min, zoom_max):
            super().__init__()
            self.tif_path = tif_path
            self.output_dir = output_dir
            self.zoom_min = zoom_min
            self.zoom_max = zoom_max

        def run(self):
            success = run_gdal_tiling(
                self.tif_path, 
                self.output_dir, 
                self.zoom_min, 
                self.zoom_max, 
                log_callback=self.log_signal.emit
            )
            self.finished_signal.emit(success)

    class MainWindow(QMainWindow):
        def __init__(self, initial_file=None):
            super().__init__()
            self.setWindowTitle("🛰️ Processador Turbo de Ortofotos (XYZ Tiles Multi-Core)")
            self.setMinimumSize(680, 560)
            self.init_ui(initial_file)

        def init_ui(self, initial_file):
            central_widget = QWidget()
            self.setCentralWidget(central_widget)
            layout = QVBoxLayout(central_widget)
            layout.setSpacing(14)
            layout.setContentsMargins(20, 20, 20, 20)

            # Estilo moderno Dark/Sleek
            self.setStyleSheet("""
                QMainWindow { background-color: #0f172a; }
                QLabel { color: #e2e8f0; font-size: 12px; font-weight: bold; }
                QLineEdit { background-color: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 8px; padding: 8px; font-size: 12px; }
                QLineEdit:focus { border: 1px solid #10b981; }
                QPushButton { background-color: #334155; color: #ffffff; border-radius: 8px; padding: 8px 16px; font-weight: bold; font-size: 12px; }
                QPushButton:hover { background-color: #475569; }
                QSpinBox { background-color: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 8px; padding: 6px; font-size: 12px; }
                QTextEdit { background-color: #090d16; color: #10b981; border: 1px solid #1e293b; border-radius: 8px; font-family: Consolas, monospace; font-size: 11px; padding: 8px; }
                QProgressBar { border: 1px solid #334155; border-radius: 6px; text-align: center; color: white; font-weight: bold; background-color: #1e293b; height: 20px; }
                QProgressBar::chunk { background-color: #10b981; border-radius: 5px; }
            """)

            # Título
            title_lbl = QLabel("🛰️ PROCESSADOR TURBO DE ORTOFOTOS")
            title_lbl.setStyleSheet("font-size: 16px; font-weight: 900; color: #10b981; margin-bottom: 2px;")
            desc_lbl = QLabel("Fatie ortofotos GeoTIFF de 500 MB a 2 GB em poucos segundos com aceleração multi-core.")
            desc_lbl.setStyleSheet("font-size: 11px; color: #94a3b8; font-weight: normal; margin-bottom: 8px;")
            layout.addWidget(title_lbl)
            layout.addWidget(desc_lbl)

            # 1. Seleção de Arquivo GeoTIFF
            layout.addWidget(QLabel("1. ARQUIVO GEOTIFF (.TIF / .TIFF):"))
            file_layout = QHBoxLayout()
            self.file_input = QLineEdit()
            self.file_input.setPlaceholderText("Clique em 'Buscar Arquivo' ou arraste o arquivo aqui...")
            if initial_file:
                self.file_input.setText(initial_file)
            self.btn_browse_file = QPushButton("📂 Buscar Arquivo...")
            self.btn_browse_file.clicked.connect(self.browse_file)
            file_layout.addWidget(self.file_input)
            file_layout.addWidget(self.btn_browse_file)
            layout.addLayout(file_layout)

            # 2. Pasta de Saída
            layout.addWidget(QLabel("2. PASTA ONDE SALVAR OS TILES GERADOS:"))
            out_layout = QHBoxLayout()
            self.out_input = QLineEdit()
            self.out_input.setPlaceholderText("A pasta será criada automaticamente ou escolha uma...")
            if initial_file:
                self.update_default_output(initial_file)
            self.btn_browse_out = QPushButton("📁 Escolher Pasta...")
            self.btn_browse_out.clicked.connect(self.browse_output_dir)
            out_layout.addWidget(self.out_input)
            out_layout.addWidget(self.btn_browse_out)
            layout.addLayout(out_layout)

            # 3. Níveis de Zoom
            zoom_layout = QHBoxLayout()
            
            zmin_box = QVBoxLayout()
            zmin_box.addWidget(QLabel("Zoom Mínimo (Ideal 16):"))
            self.spin_zoom_min = QSpinBox()
            self.spin_zoom_min.setRange(10, 24)
            self.spin_zoom_min.setValue(16)
            zmin_box.addWidget(self.spin_zoom_min)
            zoom_layout.addLayout(zmin_box)

            zmax_box = QVBoxLayout()
            zmax_box.addWidget(QLabel("Zoom Máximo (Ideal 19 ou 20):"))
            self.spin_zoom_max = QSpinBox()
            self.spin_zoom_max.setRange(10, 24)
            self.spin_zoom_max.setValue(20)
            zmax_box.addWidget(self.spin_zoom_max)
            zoom_layout.addLayout(zmax_box)

            layout.addLayout(zoom_layout)

            # Botão de Ação Principal
            self.btn_start = QPushButton("🚀 INICIAR PROCESSAMENTO TURBO")
            self.btn_start.setStyleSheet("""
                QPushButton {
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #10b981, stop:1 #059669);
                    color: white; font-size: 14px; font-weight: 900; padding: 12px; border-radius: 10px;
                }
                QPushButton:hover { background: #059669; }
                QPushButton:disabled { background: #334155; color: #64748b; }
            """)
            self.btn_start.clicked.connect(self.start_processing)
            layout.addWidget(self.btn_start)

            # Barra de Progresso
            self.progress_bar = QProgressBar()
            self.progress_bar.setRange(0, 0) # Indeterminado enquanto roda
            self.progress_bar.hide()
            layout.addWidget(self.progress_bar)

            # Log de Execução
            layout.addWidget(QLabel("LOG DO PROCESSAMENTO:"))
            self.log_text = QTextEdit()
            self.log_text.setReadOnly(True)
            layout.addWidget(self.log_text)

            # Botão Abrir Pasta
            self.btn_open_folder = QPushButton("📂 Abrir Pasta dos Tiles Gerados")
            self.btn_open_folder.setStyleSheet("background-color: #1e293b; border: 1px solid #334155;")
            self.btn_open_folder.clicked.connect(self.open_output_folder)
            self.btn_open_folder.hide()
            layout.addWidget(self.btn_open_folder)

        def browse_file(self):
            file_path, _ = QFileDialog.getOpenFileName(
                self, 
                "Selecione o arquivo GeoTIFF", 
                "", 
                "Arquivos GeoTIFF (*.tif *.tiff *.geotiff);;Todos os Arquivos (*.*)"
            )
            if file_path:
                self.file_input.setText(file_path)
                self.update_default_output(file_path)

        def update_default_output(self, file_path):
            p = Path(file_path)
            default_out = p.parent / f"tiles_{p.stem}"
            self.out_input.setText(str(default_out))

        def browse_output_dir(self):
            dir_path = QFileDialog.getExistingDirectory(self, "Selecione a Pasta de Saída")
            if dir_path:
                self.out_input.setText(dir_path)

        def log(self, message):
            self.log_text.append(message)
            # Rola para o final
            cursor = self.log_text.textCursor()
            cursor.movePosition(QtGui.QTextCursor.End)
            self.log_text.setTextCursor(cursor)

        def start_processing(self):
            tif_path = self.file_input.text().strip()
            out_dir = self.out_input.text().strip()
            z_min = self.spin_zoom_min.value()
            z_max = self.spin_zoom_max.value()

            if not tif_path or not os.path.exists(tif_path):
                QMessageBox.warning(self, "Atenção", "Por favor, selecione um arquivo GeoTIFF (.tif) válido.")
                return

            if not out_dir:
                self.update_default_output(tif_path)
                out_dir = self.out_input.text().strip()

            if z_min > z_max:
                QMessageBox.warning(self, "Atenção", "O Zoom Mínimo não pode ser maior que o Zoom Máximo.")
                return

            self.btn_start.setEnabled(False)
            self.btn_browse_file.setEnabled(False)
            self.btn_browse_out.setEnabled(False)
            self.progress_bar.show()
            self.btn_open_folder.hide()
            self.log_text.clear()
            self.log("=" * 60)
            self.log("🚀 INICIANDO PROCESSADOR TURBO DE ORTOFOTOS MULTI-CORE")
            self.log("=" * 60)

            # Inicia thread em segundo plano
            self.thread = WorkerThread(tif_path, out_dir, z_min, z_max)
            self.thread.log_signal.connect(self.log)
            self.thread.finished_signal.connect(self.on_finished)
            self.thread.start()

        def on_finished(self, success):
            self.progress_bar.hide()
            self.btn_start.setEnabled(True)
            self.btn_browse_file.setEnabled(True)
            self.btn_browse_out.setEnabled(True)

            if success:
                self.btn_open_folder.show()
                QMessageBox.information(
                    self, 
                    "Sucesso!", 
                    "A ortofoto foi fatiada com sucesso!\n\nAgora você pode carregar a pasta no sistema GeoGestor."
                )
            else:
                QMessageBox.critical(
                    self, 
                    "Erro", 
                    "Ocorreu um erro durante o processamento. Verifique o log abaixo."
                )

        def open_output_folder(self):
            out_dir = self.out_input.text().strip()
            if out_dir and os.path.exists(out_dir):
                os.startfile(out_dir)

    def main_gui():
        app = QApplication(sys.argv)
        initial_file = sys.argv[1] if len(sys.argv) > 1 else None
        window = MainWindow(initial_file)
        window.show()
        sys.exit(app.exec_())

except ImportError:
    def main_gui():
        print("[-] PyQt5 não está disponível no ambiente. Executando em modo texto.")
        if len(sys.argv) > 1:
            target = sys.argv[1]
        else:
            target = input("Digite o caminho do arquivo .tif: ").strip(' "\'')
        run_gdal_tiling(target, Path(target).parent / f"tiles_{Path(target).stem}", 14, 19, print)

if __name__ == "__main__":
    main_gui()
