# 🛰️ Processador Turbo de Ortofotos (XYZ Tiles Multi-Core)

Ferramenta autônoma e ultra-rápida para fatiamento e otimização de imagens aéreas e ortofotos GeoTIFF gigantes (500 MB a 5 GB) para uso no sistema WebGIS **GeoGestor**.

---

## 📋 Pré-requisitos
Para rodar em qualquer computador com Windows:
- **Ter o [QGIS](https://qgis.org) instalado** (qualquer versão 3.x).
  *(O QGIS já inclui todo o motor nativo GDAL e Python com aceleração multi-core necessária).*

---

## 🚀 Como Usar em 1 Clique

### Opção 1: Arrastar e Soltar (Mais Fácil)
1. Pegue seu arquivo `.tif` da ortofoto.
2. **Arraste e solte o arquivo `.tif` em cima do ícone `processar_ortofoto.bat`**.
3. A tela preta abrirá, detectará todos os núcleos do processador e fará o fatiamento em segundos.

### Opção 2: Dois Cliques
1. Dê dois cliques em **`processar_ortofoto.bat`**.
2. Arraste o arquivo `.tif` para dentro da janela e aperte **ENTER**.

---

## 📁 Resultado Gerado
Ao finalizar, será criada uma pasta com o nome `tiles_NomeDoArquivo/` contendo:
- Subpastas com os níveis de zoom (`14`, `15`, `16`, `17`, `18`, `19`...).
- Arquivo `metadados_camada.json` com os limites geográficos calibrados.

---

## 🌐 Como carregar no GeoGestor:
1. Abra o mapa no navegador.
2. Clique no menu de **Importações** > **"Ortofoto Fatiada (XYZ Tiles - Turbo 60 FPS)"**.
3. Informe o nome e o caminho/URL da pasta gerada (ex: `assets/tiles_cabedelo/{z}/{x}/{y}.png`).
4. A ortofoto carregará **instantaneamente a 60 FPS** com máxima resolução!
