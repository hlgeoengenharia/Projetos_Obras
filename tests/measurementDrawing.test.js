const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Validação Completa da Ferramenta de Medição (Pontos, Linhas e Polígonos)', async (t) => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    const measJs = fs.readFileSync(path.join(__dirname, '../src/measurement.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    await t.test('1. Leaflet Canvas _onClick repassa clique para o mapa durante medição (this._fireEvent(false, e))', () => {
        assert(mainJs.includes('if (isMeasuringActive || isDrawingActive) {'), 'Deve verificar se medição ou desenho está ativo');
        assert(mainJs.includes('this._fireEvent(false, e);'), 'Deve disparar this._fireEvent(false, e) para que o Leaflet dispare map.fire("click")');
    });

    await t.test('2. Leaflet Canvas _onClick dispara clique no mapa em áreas vazias', () => {
        assert(mainJs.includes('this._fireEvent(finalLayer ? [finalLayer] : false, e);'), 'Deve invocar _fireEvent com false se nenhuma feição for clicada');
    });

    await t.test('3. Leaflet Canvas _handleMouseHover ignora feições vetoriais durante medição', () => {
        assert(mainJs.includes('if (isMeasuringActive || isDrawingActive) {') && mainJs.includes('if (this._hoveredLayer) {') && mainJs.includes('this._handleMouseOut(e);'), 'Deve cancelar hover e retornar durante medição');
    });

    await t.test('4. startMeasurementDraw mantém o botão da ferramenta ativo e com destaque visual', () => {
        assert(measJs.includes("btn.classList.add('bg-emerald-50'"), 'Deve adicionar classe de botão ativo');
        assert(measJs.includes("meas-btn-"), 'Deve referenciar IDs de botões da medição');
    });

    await t.test('5. finishOn: "dblclick" NÃO é aplicado a Marker (apenas Line e Polygon)', () => {
        const normMeas = measJs.replace(/\r\n/g, '\n');
        assert(normMeas.includes("if (shape === 'Line' || shape === 'Polygon') {\n        drawOptions.finishOn = 'dblclick';\n    }"), 'finishOn dblclick deve ser restrito a Line e Polygon');
    });

    await t.test('6. Marker drawOptions NÃO inclui draggable: true durante o desenho', () => {
        assert(!measJs.includes("markerStyle = {\n            icon: pointIcon,\n            draggable: true"), 'markerStyle não deve conter draggable durante o desenho para não travar o clique');
    });

    await t.test('7. Suporte a inserção contínua de pontos técnicos (P01, P02...)', () => {
        assert(measJs.includes("startMeasurementDraw('Marker')"), 'Deve reiniciar modo Marker para inserção consecutiva');
        assert(measJs.includes("getTechPointIcon"), 'Deve gerar ícones técnicos numerados');
    });

    await t.test('8. Edição de Linhas e Polígonos habilitada após conclusão (vértices e arrasto)', () => {
        assert(measJs.includes("layer.pm.enable({"), 'Deve habilitar Geoman pm na camada criada');
        assert(measJs.includes("allowSelfIntersection: true"), 'Deve permitir auto-interseção');
        assert(measJs.includes("preventMarkerRemoval: false"), 'Deve permitir remoção de vértices');
        assert(measJs.includes("draggable: true"), 'Deve permitir arrastar a forma geométrica');
    });

    await t.test('9. Cache busting atualizado em index.html', () => {
        assert(/src\/main\.js\?v=/.test(indexHtml), 'main.js deve possuir parâmetro de versão');
        assert(/src\/measurement\.js\?v=/.test(indexHtml), 'measurement.js deve possuir parâmetro de versão');
    });

    await t.test('10. setupMeasurementEvents possui guarda de idempotência para evitar eventos duplicados', () => {
        assert(measJs.includes('if (window._isMeasurementEventsSetup) return;'), 'Deve ter guarda de idempotência');
        assert(measJs.includes('window._isMeasurementEventsSetup = true;'), 'Deve marcar _isMeasurementEventsSetup como true');
    });

    await t.test('11. Marcador Uber-style com ancoragem na agulha inferior e continueDrawing: false', () => {
        assert(measJs.includes("iconAnchor: [14, 38]"), 'Ancoragem deve ser exatamente na ponta inferior da agulha');
        assert(measJs.includes("drawOptions.continueDrawing = false;"), 'Marker deve ter continueDrawing: false para controle sequencial limpo');
        assert(measJs.includes("custom-uber-point-marker"), 'Deve utilizar classe do marcador Uber');
    });

    await t.test('12. CAD Medida Exata HUD centralizado com botão de inserção e conclusão rápida', () => {
        assert(indexHtml.includes('id="cad-measure-hud"'), 'HUD central deve existir em index.html');
        assert(indexHtml.includes('id="cad-measure-apply-btn"'), 'Botão de inserir medida deve existir');
        assert(indexHtml.includes('id="cad-measure-finish-btn"'), 'Botão de concluir desenho deve existir');
        assert(measJs.includes('window.finishCurrentMeasurementDraw'), 'Função de conclusão rápida deve estar exposta');
    });

    await t.test('13. Snapping restrito exclusivamente a snapLayers para evitar congelamento do navegador', () => {
        assert(measJs.includes('snapLayers: snapLayersList'), 'Deve passar snapLayersList no drawOptions');
        assert(measJs.includes('snapLayersList = (measurementLayerGroup && measurementLayerGroup.getLayers().length > 0) ? [measurementLayerGroup] : []'), 'snapLayers deve conter apenas o grupo de medição');
    });

    await t.test('14. AutoCAD Osnap Engine com glifos visuais para Vértices e Arestas', () => {
        assert(measJs.includes('function findAutoCadSnap'), 'findAutoCadSnap deve estar implementada');
        assert(measJs.includes('function showAutoCadSnap'), 'showAutoCadSnap deve estar implementada');
        assert(measJs.includes('autocad-snap-vertex'), 'Deve utilizar classe de vértice');
        assert(measJs.includes('autocad-snap-edge'), 'Deve utilizar classe de aresta');
        assert(indexHtml.includes('.autocad-snap-badge'), 'CSS de badge do snap deve existir');
    });

    await t.test('15. Marcador Uber Live Cursor acompanha o movimento do mouse', () => {
        assert(measJs.includes('function updateUberLiveCursor'), 'updateUberLiveCursor deve existir');
        assert(measJs.includes('function hideUberLiveCursor'), 'hideUberLiveCursor deve existir');
        assert(measJs.includes('createTechnicalPoint(targetLatLng)'), 'Clique no mapa deve inserir ponto técnico imediatamente');
    });

    await t.test('16. Medida Exata trava a direção no HUD e suporta atalho numérico', () => {
        assert(measJs.includes('isCadDirectionLocked'), 'Deve controlar travamento de direção CAD');
        assert(measJs.includes('cadTargetDirectionLatLng'), 'Deve armazenar vetor de mira');
        assert(measJs.includes('getDestinationLatLng(lastDrawnVertex, aimLatLng, distMeters)'), 'Deve aplicar cálculo geodésico na direção correta');
    });

    await t.test('17. Polígono fecha suavemente ao clicar no primeiro vértice', () => {
        assert(measJs.includes("type: 'close-polygon'"), 'Deve identificar snap de fechamento de polígono');
        assert(measJs.includes("finishCurrentMeasurementDraw()"), 'Deve invocar fechamento automático ao clicar no 1º vértice');
    });
});
