import hmac
import hashlib
import datetime
import urllib.request
import urllib.error

ENDPOINT_HOST = "cc081e2e8b5b0550b2a2c6278e731395.r2.cloudflarestorage.com"
ACCESS_KEY = "e246fda086280ff0313f7c0b19986213"
SECRET_KEY = "d768abbbf53d9dfdece94f0ffc97158c1454ceea2c8c6b40e92d7c880353a03f"
BUCKET = "ortofotos-webgis"
REGION = "auto"

def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(key, date_stamp, region_name, service_name):
    k_date = sign(('AWS4' + key).encode('utf-8'), date_stamp)
    k_region = sign(k_date, region_name)
    k_service = sign(k_region, service_name)
    k_signing = sign(k_service, 'aws4_request')
    return k_signing

def put_test_file():
    key = "teste_conexao.txt"
    payload = b"Conexao com Cloudflare R2 estabelecida com sucesso!"
    payload_hash = hashlib.sha256(payload).hexdigest()
    
    t = datetime.datetime.now(datetime.timezone.utc)
    amz_date = t.strftime('%Y%m%dT%H%M%SZ')
    date_stamp = t.strftime('%Y%m%d')
    
    host = ENDPOINT_HOST
    canonical_uri = f"/{BUCKET}/{key}"
    canonical_querystring = ""
    canonical_headers = f"host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n"
    signed_headers = "host;x-amz-content-sha256;x-amz-date"
    
    canonical_request = f"PUT\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    algorithm = "AWS4-HMAC-SHA256"
    credential_scope = f"{date_stamp}/{REGION}/s3/aws4_request"
    string_to_sign = f"{algorithm}\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"
    
    signing_key = get_signature_key(SECRET_KEY, date_stamp, REGION, "s3")
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
    
    auth_header = f"{algorithm} Credential={ACCESS_KEY}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    
    url = f"https://{ENDPOINT_HOST}/{BUCKET}/{key}"
    headers = {
        'host': ENDPOINT_HOST,
        'x-amz-date': amz_date,
        'x-amz-content-sha256': payload_hash,
        'Authorization': auth_header,
        'Content-Type': 'text/plain'
    }
    
    req = urllib.request.Request(url, data=payload, headers=headers, method='PUT')
    try:
        with urllib.request.urlopen(req) as resp:
            print("Status:", resp.status)
            print(">>> SUCESSO ABSOLUTO! Arquivo enviado e armazenado no Cloudflare R2!")
    except urllib.error.HTTPError as e:
        print("Erro HTTP:", e.code, e.read().decode('utf-8'))

if __name__ == '__main__':
    put_test_file()
