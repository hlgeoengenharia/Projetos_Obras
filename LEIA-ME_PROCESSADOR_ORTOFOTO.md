# 🛰️ Processador Turbo de Ortofotos (XYZ Tiles Multi-Core)

Ferramenta de alta performance para fatiamento de imagens aéreas e ortofotos GeoTIFF de drones (500 MB a 5 GB) para uso no sistema WebGIS.

---

## 📋 Pré-requisitos
Para rodar em qualquer computador com Windows:
- **Ter o [QGIS](https://qgis.org) instalado** (versão 3.x de 64 bits).
  *(O QGIS já inclui nativamente todo o motor GDAL de satélites e aceleração multi-core necessária).*

---

## 🚀 Como Usar em 1 Clique

1. Dê dois cliques em **`processar_ortofoto.bat`**.
2. Clique em **"📂 Buscar Arquivo..."** e selecione o seu arquivo `.tif`.
3. As configurações ideais já vêm selecionadas por padrão:
   - **Zoom Mínimo:** `16`
   - **Zoom Máximo:** `21` *(Alta Resolução - Qualidade Original de Drone)*
   - **Formato:** `WebP 90%` com algoritmo `Lanczos` *(80% mais leve e sem perda visual)*
4. Clique no botão verde **"🚀 INICIAR PROCESSAMENTO TURBO"**.

---

## 📁 Como Enviar para o Mapa:
1. Acesse o sistema e abra a aba **Configurações > ARQUIVOS**.
2. No campo **SELECIONAR PASTA DE TILES**, clique em **Escolher arquivos** e selecione a pasta fatiada.
3. Clique em **"Enviar Pasta Completa"**.
4. O sistema enviará os arquivos com controle de fluxo inteligente e cadastrará a ortofoto no mapa automaticamente!
