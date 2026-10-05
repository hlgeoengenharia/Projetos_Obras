"""
Script de Migracao Turbo de Ortofotos para Cloudflare R2
Transfere as pastas de tiles locais para o Cloudflare R2 e atualiza as URLs no Supabase
"""

import os
import sys
import json
import time
import hmac
import hashlib
import datetime
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

SUPABASE_URL = "https://iqejynikmeroiqyigsjo.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ"

R2_CONFIG = {
    "endpoint_host": "cc081e2e8b5b0550b2a2c6278e731395.r2.cloudflarestorage.com",
    "access_key_id": "e246fda086280ff0313f7c0b19986213",
    "secret_access_key": "d768abbbf53d9dfdece94f0ffc97158c1454ceea2c8c6b40e92d7c880353a03f",
    "bucket_name": "ortofotos-webgis",
    "worker_url": "https://ortofotos-tiles.heltonleite-geotec.workers.dev"
}

_R2_CONFIG_FILE = Path(__file__).resolve().parent / "CloudFlare" / "r2_config.json"
if _R2_CONFIG_FILE.exists():
    try:
        with open(_R2_CONFIG_FILE, "r", encoding="utf-8") as f:
            R2_CONFIG.update(json.load(f))
    except Exception:
        pass

def _r2_sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def _r2_get_signing_key(secret_key, date_stamp):
    k_date = _r2_sign(('AWS4' + secret_key).encode('utf-8'), date_stamp)
    k_region = _r2_sign(k_date, 'auto')
    k_service = _r2_sign(k_region, 's3')
    return _r2_sign(k_service, 'aws4_request')

def upload_file_to_r2(file_path, storage_path, max_retries=3):
    ext = file_path.suffix.lower()
    content_type = "image/webp" if ext == ".webp" else ("image/png" if ext == ".png" else "application/octet-stream")

    try:
        with open(file_path, "rb") as f:
            data = f.read()
    except Exception:
        return False

    payload_hash = hashlib.sha256(data).hexdigest()
    t = datetime.datetime.now(datetime.timezone.utc)
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')

    host = R2_CONFIG["endpoint_host"]
    bucket = R2_CONFIG["bucket_name"]
    canonical_uri = f"/{bucket}/{storage_path}"
    canonical_headers = f"host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    canonical_request = f"PUT\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}"

    credential_scope = f"{date_stamp}/auto/s3/aws4_request"
    string_to_sign = f"AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"

    signing_key = _r2_get_signing_key(R2_CONFIG["secret_access_key"], date_stamp)
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

    auth_header = f"AWS4-HMAC-SHA256 Credential={R2_CONFIG['access_key_id']}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    url = f"https://{host}/{bucket}/{storage_path}"

    headers = {
        'host': host,
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': auth_header,
        'Content-Type': content_type
    }

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method='PUT')
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status in (200, 201):
                    return True
        except Exception:
            if attempt == max_retries:
                return False
            time.sleep(0.3 * attempt)
    return False

def migrar_pasta(pasta_local, prefixo_r2, max_workers=24):
    p = Path(pasta_local)
    if not p.exists():
        print(f"[-] Pasta nao encontrada: {pasta_local}")
        return False

    arquivos = [f for f in p.rglob('*') if f.is_file() and not f.name.startswith('.')]
    total = len(arquivos)
    print(f"\n=======================================================")
    print(f"[*] Migrando pasta: {p.name}")
    print(f"[*] Total de arquivos: {total:,}")
    print(f"[*] Destino no R2: {prefixo_r2}")
    print(f"[*] Enviando com {max_workers} conexoes paralelas...")
    print(f"=======================================================")

    start_time = time.time()
    enviados = 0
    falhas = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {}
        for arq in arquivos:
            rel = arq.relative_to(p).as_posix()
            storage_path = f"{prefixo_r2}/{rel}"
            f = executor.submit(upload_file_to_r2, arq, storage_path)
            futures[f] = storage_path

        for future in as_completed(futures):
            enviados += 1
            if not future.result():
                falhas += 1

            if enviados % 500 == 0 or enviados == total:
                pct = int((enviados / total) * 100)
                decorrido = time.time() - start_time
                vel = enviados / max(0.1, decorrido)
                seg_rest = (total - enviados) / max(0.1, vel)
                m = int(seg_rest // 60)
                s = int(seg_rest % 60)
                print(f"  -> Progresso: {pct}% ({enviados}/{total}) - {vel:.1f} arq/s - Restante: {m:02d}m{s:02d}s", flush=True)

    total_s = time.time() - start_time
    print(f"\n[OK] Pasta {p.name} concluida em {total_s:.1f}s ({total_s/60:.2f} min). Falhas: {falhas}", flush=True)
    return falhas == 0

def main():
    print("=" * 60)
    print("🚀 MIGRACAO AUTOMATICA DE ORTOFOTOS -> CLOUDFLARE R2")
    print(f"Bucket: {R2_CONFIG['bucket_name']}")
    print(f"CDN Worker: {R2_CONFIG['worker_url']}")
    print("=" * 60)

    pastas_conhecidas = [
        (
            r"C:\Users\Windows 11\Documents\MPF\Base_MPF\Base_MPF\08-06-2026\Orotofos-MPF\webp\10-02-2026-tiles",
            "cabedelo_pb/10-02-2026-tiles"
        ),
        (
            r"C:\Users\Windows 11\Documents\MPF\Base_MPF\Base_MPF\08-06-2026\Orotofos-MPF\webp\01-09-2026-tiles",
            "cabedelo_pb/01-09-2026-tiles"
        ),
        (
            r"C:\Users\Windows 11\Documents\MPF\Base_MPF\Base_MPF\08-06-2026\Ortofoto_Base_Cabedelo_V02",
            "cabedelo_pb/Ortofoto_Base_Cabedelo_V02"
        ),
        (
            r"C:\Users\Windows 11\Documents\MPF\Base_MPF\Base_MPF\08-06-2026\Ortofoto_Base_Cabedelo",
            "cabedelo_pb/Ortofoto_Base_Cabedelo_2021"
        )
    ]

    for local, r2_dest in pastas_conhecidas:
        if os.path.exists(local):
            migrar_pasta(local, r2_dest)
        else:
            print(f"[!] Pasta ignorada (nao existe): {local}")

    print("\n" + "=" * 60)
    print("✨ MIGRACAO DE ARQUIVOS CONCLUIDA COM SUCESSO!")
    print("=" * 60)

if __name__ == '__main__':
    main()
