"""
Upload Turbo de Pastas de Tiles (Ortofoto) para o Supabase Storage
Envia milhares de arquivos em paralelo (Multi-threading) com alta performance.
"""

import os
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from supabase import create_client, Client
except ImportError:
    print("[!] Instalando modulo supabase...")
    os.system(f"{sys.executable} -m pip install supabase")
    from supabase import create_client, Client

# Configuracoes do Supabase
SUPABASE_URL = "https://iqejynikmeroiqyigsjo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY2NTEzNzUsImV4cCI6MjA2MjIyNzM3NX0.iZ8i8qA_xR_9tF_gEwE-G7wE6vYfL1xR1xR1xR1xR1x"
BUCKET_NAME = "obras_arquivos"

def upload_single_file(supabase, file_path, storage_path, max_retries=3):
    for attempt in range(1, max_retries + 1):
        try:
            with open(file_path, "rb") as f:
                supabase.storage.from_(BUCKET_NAME).upload(
                    path=storage_path,
                    file=f,
                    file_options={"cache-control": "86400", "upsert": "true"}
                )
            return True
        except Exception as e:
            if attempt == max_retries:
                return False
            time.sleep(0.5 * attempt)
    return False

def main():
    print("=" * 75)
    print(" 🚀 UPLOAD TURBO DE ORTOFOTOS (SUPABASE STORAGE MULTI-THREAD)")
    print("=" * 75)
    
    if len(sys.argv) < 2:
        print("\nComo usar:")
        print(" Arraste a pasta gerada pelo 'processar_ortofoto.bat' para cima deste arquivo .bat")
        print(" ou informe o caminho da pasta.")
        pasta_input = input("\nDigite o caminho da pasta de tiles: ").strip().strip('"')
    else:
        pasta_input = sys.argv[1].strip().strip('"')

    pasta = Path(pasta_input).resolve()
    if not pasta.exists() or not pasta.is_dir():
        print(f"[-] Erro: Pasta invalida: {pasta}")
        input("\nPressione Enter para sair...")
        return

    municipio_pasta = input("\nNome da subpasta no Storage (ex: cabedelo_pb): ").strip().strip('"')
    if not municipio_pasta:
        municipio_pasta = "cabedelo_pb"

    # Coleta todos os arquivos
    print(f"\n[+] Indexando arquivos na pasta {pasta.name}...")
    todos_arquivos = [p for p in pasta.rglob("*") if p.is_file()]
    total = len(todos_arquivos)
    print(f"[+] Encontrados {total} arquivos para envio.")

    if total == 0:
        print("[-] Nenhum arquivo encontrado na pasta.")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 15 threads simultâneas para alta velocidade
    WORKERS = 16
    print(f"[+] Iniciando envio paralelo com {WORKERS} conexoes simultaneas...\n")
    
    start_time = time.time()
    enviados = 0
    falhas = 0

    with ThreadPoolExecutor(max_workers=WORKERS) as executor:
        futures = {}
        for arq in todos_arquivos:
            rel_path = arq.relative_to(pasta.parent).as_posix()
            storage_path = f"{municipio_pasta}/{rel_path}"
            f = executor.submit(upload_single_file, supabase, str(arq), storage_path)
            futures[f] = storage_path

        for future in as_completed(futures):
            enviados += 1
            if not future.result():
                falhas += 1
            
            if enviados % 100 == 0 or enviados == total:
                pct = (enviados / total) * 100
                tempo_decorrido = time.time() - start_time
                velocidade = enviados / max(1, tempo_decorrido)
                restante_segundos = (total - enviados) / max(0.1, velocidade)
                minutos_rest = int(restante_segundos // 60)
                segundos_rest = int(restante_segundos % 60)
                
                sys.stdout.write(f"\r[{pct:5.1f}%] Enviados: {enviados}/{total} | Vel: {velocidade:.1f} arq/s | Restante: {minutos_rest:02d}m{segundos_rest:02d}s")
                sys.stdout.flush()

    total_time = time.time() - start_time
    print(f"\n\n[✓] Upload finalizado em {total_time/60:.2f} minutos!")
    if falhas > 0:
        print(f"[!] {falhas} arquivos falharam no envio.")
    else:
        print("[✓] 100% dos arquivos enviados com sucesso!")

    print(f"\n[+] URL Base pública: {SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{municipio_pasta}/{pasta.name}/{{z}}/{{x}}/{{y}}.webp")
    input("\nPressione Enter para concluir...")

if __name__ == "__main__":
    main()
