"""
Upload Turbo de Pastas de Tiles (Ortofoto) para o Supabase Storage
Envia milhares de arquivos em paralelo (Multi-threading) com alta performance e sem travar o navegador.
Cadastra a camada automaticamente na tabela imagens_raster do Supabase.
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
    
    # Determina content-type
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
            if e.code == 400 or e.code == 409:
                # Tenta PUT se POST der conflito
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
            time.sleep(0.5 * attempt)
        except Exception:
            if attempt == max_retries:
                return False
            time.sleep(0.5 * attempt)
    return False

def get_municipios():
    try:
        url = f"{SUPABASE_URL}/rest/v1/municipios?select=id,nome,uf&ativo=eq.true"
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

def main():
    print("=" * 75)
    print(" 🚀 UPLOAD TURBO DE ORTOFOTOS PARA O SUPABASE STORAGE (MULTI-THREAD)")
    print("=" * 75)

    if len(sys.argv) < 2:
        print("\nComo usar:")
        print(" 1. Arraste a pasta gerada pelo 'processar_ortofoto.bat' para cima do 'upload_ortofoto.bat'")
        print(" 2. Ou cole o caminho completo da pasta abaixo:")
        pasta_input = input("\nDigite o caminho da pasta de tiles: ").strip().strip('"')
    else:
        pasta_input = sys.argv[1].strip().strip('"')

    pasta = Path(pasta_input).resolve()
    if not pasta.exists() or not pasta.is_dir():
        print(f"\n[-] Erro: Pasta invalida ou nao encontrada: {pasta}")
        input("\nPressione Enter para sair...")
        return

    # Busca municípios para vincular
    municipios = get_municipios()
    municipio_selecionado = None
    municipio_pasta = "cabedelo_pb"

    if municipios:
        print("\nSelecione o Município correspondente:")
        for idx, m in enumerate(municipios, 1):
            print(f" [{idx}] {m.get('nome')} - {m.get('uf')}")
        escolha = input(f"\nEscolha o numero [1-{len(municipios)}] (padrao: 1): ").strip()
        try:
            escolha_idx = int(escolha) - 1 if escolha else 0
            if 0 <= escolha_idx < len(municipios):
                municipio_selecionado = municipios[escolha_idx]
                nome_slug = municipio_selecionado.get('nome', '').lower().replace(' ', '_')
                uf_slug = municipio_selecionado.get('uf', '').lower()
                municipio_pasta = f"{nome_slug}_{uf_slug}"
        except Exception:
            municipio_selecionado = municipios[0]

    # Indexa os arquivos da pasta
    print(f"\n[+] Indexando arquivos na pasta: {pasta.name}...")
    todos_arquivos = [p for p in pasta.rglob("*") if p.is_file() and not p.name.startswith('.')]
    total = len(todos_arquivos)
    print(f"[+] Total de {total:,} arquivos encontrados.")

    if total == 0:
        print("[-] Nenhum arquivo de imagem encontrado dentro da pasta.")
        input("\nPressione Enter para sair...")
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

    print(f"[+] Formato das imagens: .{sample_ext}")
    print(f"[+] Niveis de Zoom detectados: {z_min} ao {z_max}")
    
    # Nome da camada limpo
    nome_camada = pasta.name.replace('tiles_', '').replace('Ortotofo_', 'Ortofoto_').replace('_', ' ')

    WORKERS = 16
    print(f"\n[+] Iniciando upload paralelo com {WORKERS} threads no Supabase Storage...")
    print(f"[+] Destino: bucket '{BUCKET_NAME}' / pasta '{municipio_pasta}/{pasta.name}'\n")

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

            if enviados % 100 == 0 or enviados == total:
                pct = (enviados / total) * 100
                tempo_decorrido = time.time() - start_time
                velocidade = enviados / max(1, tempo_decorrido)
                restante_segundos = (total - enviados) / max(0.1, velocidade)
                minutos_rest = int(restante_segundos // 60)
                segundos_rest = int(restante_segundos % 60)

                sys.stdout.write(f"\r[{pct:5.1f}%] Enviados: {enviados:,}/{total:,} | Vel: {velocidade:.1f} arq/s | Restante: {minutos_rest:02d}m{segundos_rest:02d}s")
                sys.stdout.flush()

    total_time = time.time() - start_time
    print(f"\n\n[✓] Upload concluido em {total_time/60:.2f} minutos!")
    if falhas > 0:
        print(f"[!] {falhas} arquivos falharam no envio.")
    else:
        print("[✓] 100% dos arquivos enviados com sucesso!")

    # Registra no banco de dados
    tile_template_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{municipio_pasta}/{pasta.name}/{{z}}/{{x}}/{{y}}.{sample_ext}"
    print(f"\n[+] URL da Camada: {tile_template_url}")

    if municipio_selecionado:
        mun_id = municipio_selecionado.get('id')
        print(f"[+] Registrando camada '{nome_camada}' no município {municipio_selecionado.get('nome')}...")
        ok_db = registrar_camada_raster(mun_id, nome_camada, tile_template_url, z_min, z_max)
        if ok_db:
            print("[✓] Camada registrada com sucesso no banco de dados!")
            print("[+] Agora basta abrir o mapa ou dar F5 para visualizar a ortofoto em Camadas > Ortofotos!")
        else:
            print("[!] Aviso: A pasta foi enviada, mas o registro automatico falhou. Voce pode vincula-la no Gerenciador de Arquivos em settings.html.")

    print("\n" + "=" * 75)
    input("Concluido! Pressione Enter para fechar esta janela...")

if __name__ == "__main__":
    main()
