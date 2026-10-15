const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mainJs = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const measJs = fs.readFileSync(path.join(__dirname, '../src/measurement.js'), 'utf8');

test('Validação dos 4 Requisitos: Rótulo Bairro, Cor do Fundo, Pino Uber Medição e CAD Medida Exata', async (t) => {

    await t.test('1. Rotulação para camada Bairro e polígonos não-CTM', () => {
        // Verifica se a classe ctm-lot-label foi isolada para micro-lotes
        assert(mainJs.includes("const isSmallLotTheme = theme && (String(theme.id).toLowerCase().includes('ctm') || (theme.features && theme.features.length > 2000));"), 'Deve identificar micro-lotes densos');
        assert(mainJs.includes("const lotClass = isSmallLotTheme ? 'ctm-lot-label' : '';"), 'Apenas micro-lotes devem receber a classe oculta ctm-lot-label');
        
        // Verifica se em updateLabelsVisibility o zoom mínimo para bairros é 12
        assert(mainJs.includes("const minPolyZoom = isSmallLotTheme ? 17.5 : 12;"), 'Camadas normais como Bairro devem aparecer a partir de zoom 12');
        assert(mainJs.includes("if (!isSmallLotTheme) {"), 'Polígonos gerais não devem sofrer descarte por pixel de micro-lote');

        // Fallback inteligente de propriedade para Bairro
        assert(mainJs.includes("bAliases = ['bairro', 'nmbairro', 'nomebairro', 'nome_bairro'"), 'Deve incluir aliases para Bairro');
        assert(mainJs.includes("loadAllFeaturesToMap(); // Atualiza geometrias, cores de preenchimento e recria rótulos com exibição 1 e 2"), 'saveEditedTheme deve recriar feições com loadAllFeaturesToMap');
    });

    await t.test('2. Opção de Cor de Fundo (fillColor) na Janela Editar Tema', () => {
        // Campo de cor de fundo em index.html
        assert(indexHtml.includes('id="edit-theme-fill-color-input"'), 'Deve conter input de Cor do Fundo em Editar Tema');
        assert(indexHtml.includes('id="edit-theme-fill-color-wrapper"'), 'Deve conter wrapper para ocultar em temas de linha');

        // Lógica em main.js
        assert(mainJs.includes("const fillColorEl = document.getElementById('edit-theme-fill-color-input');"), 'Deve ler input de cor de fundo');
        assert(mainJs.includes("theme.fillColor = fillColor;"), 'Deve persistir fillColor no tema');
        assert(mainJs.includes("const finalFillColor = (theme && theme.fillColor) ? theme.fillColor : color;"), 'Style do geojsonLayer deve aplicar fillColor independente');
    });

    await t.test('3. Movimentação direta de ponto de medição por arraste nativo no mapa', () => {
        // Movimentação por arraste nativo do marcador no mapa
        assert(measJs.includes("layer.dragging.enable()"), 'Marcador técnico deve ser arrastável diretamente no mapa');
        assert(measJs.includes("layer.on('dragstart'"), 'Deve conter manipulador de dragstart');
        assert(measJs.includes("layer.on('dragend'"), 'Deve conter manipulador de dragend');
        assert(measJs.includes("renderMarker();"), 'Deve atualizar coordenadas do ponto ao mover');
    });

    await t.test('4. Medida Exata CAD com fluxo intuitivo em 2 passos (sem alerts intrusivos)', () => {
        // Mensagens orientativas do HUD
        assert(measJs.includes("Passo 1</span> Clique no mapa para marcar o ponto inicial"), 'HUD deve orientar Passo 1');
        assert(measJs.includes("Passo 2</span> Aponte a direção"), 'HUD deve orientar Passo 2');
        assert(measJs.includes("Aguardando 1º ponto..."), 'Placeholder amigável enquanto não há ponto');
        assert(!measJs.includes('alert("Mova o cursor do mouse na direção desejada'), 'Não deve conter o alert intrusivo relatado pelo usuário');
    });
});
