const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Validação Específica da Ferramenta de Ponto da Medição', async (t) => {
    const measJs = fs.readFileSync(path.join(__dirname, '../src/measurement.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    await t.test('1. Eliminação do tooltip intrusivo e bloqueio de criação duplicada no Ponto', () => {
        // Verifica que layer.bindTooltip não é chamado no marcador de medição
        const markerBlock = measJs.substring(measJs.indexOf("currentShape === 'Marker'"), measJs.indexOf("list.appendChild(item)"));
        assert(!markerBlock.includes('layer.bindTooltip'), 'Marcador de medição não deve ter tooltip intrusivo cobrindo o cursor');
        
        // Verifica que mousedown, dragstart e click previnem propagação para o mapa
        assert(markerBlock.includes("window._isHoveringMeasMarker = true"), 'Deve rastrear hover sobre marcador');
        assert(markerBlock.includes("window._isDraggingMeasMarker = true"), 'Deve rastrear arraste do marcador');
        assert(markerBlock.includes("hideUberLiveCursor()"), 'Live cursor fantasma deve ser ocultado ao interagir com ponto');
        assert(markerBlock.includes("L.DomEvent.stopPropagation(ev)"), 'Clique/mousedown no marcador deve impedir novo ponto no mapa');
    });

    await t.test('2. Guarda de clique no mapa para evitar empilhamento/duplicação de pontos ao mover', () => {
        const clickBlock = measJs.substring(measJs.indexOf("map.on('click'"), measJs.indexOf("map.on('pm:create'"));
        assert(clickBlock.includes('if (window._isHoveringMeasMarker || window._isDraggingMeasMarker) return;'),
            'Clique no mapa não deve disparar se o usuário estiver sobre ou movendo um ponto existente');
    });

    await t.test('3. Isolamento de marcadores de medição no findAutoCadSnap para evitar pontos presos', () => {
        const snapFn = measJs.substring(measJs.indexOf('function findAutoCadSnap'), measJs.indexOf('function updateUberLiveCursor'));
        assert(snapFn.includes("if (currentMeasurementMode === 'Marker') return;"),
            'findAutoCadSnap não deve travar o cursor em marcadores anteriores durante o modo Marker');
    });

    await t.test('4. Suporte completo ao AutoCAD Osnap: Vértice, Ponto Médio e Aresta', () => {
        assert(measJs.includes("type === 'midpoint'"), 'showAutoCadSnap deve tratar Ponto Médio');
        assert(measJs.includes("autocad-snap-midpoint"), 'Classe CSS do glifo de ponto médio deve ser usada');
        assert(measJs.includes("Ponto Médio"), 'Rótulo Ponto Médio deve existir');
        assert(indexHtml.includes('.autocad-snap-midpoint'), 'CSS do triângulo ciano do ponto médio deve existir no HTML');
        assert(indexHtml.includes('.autocad-snap-badge.midpoint'), 'CSS do badge de ponto médio deve existir no HTML');
    });

    await t.test('5. Liberdade de clique fora das feições (retorno null fora das tolerâncias)', () => {
        const snapFn = measJs.substring(measJs.indexOf('function findAutoCadSnap'), measJs.indexOf('function updateUberLiveCursor'));
        assert(snapFn.includes('bestVertexSnap && minVertexDist <= vertexTolerancePx'), 'Vértice deve respeitar tolerância');
        assert(snapFn.includes('bestMidpointSnap && minMidpointDist <= midpointTolerancePx'), 'Ponto médio deve respeitar tolerância');
        assert(snapFn.includes('bestEdgeSnap && minEdgeDist <= edgeTolerancePx'), 'Aresta deve respeitar tolerância');
        assert(snapFn.includes('return null;'), 'Deve retornar null fora das tolerâncias para deixar o clique livre');
    });

    await t.test('6. Feedback visual aprimorado durante o arraste do ponto (mão fechada e elevação)', () => {
        assert(measJs.includes('meas-marker-dragging'), 'Classe meas-marker-dragging deve ser aplicada durante o arraste');
        assert(measJs.includes('cursor: grabbing'), 'Cursor grabbing deve ser ativado durante o movimento');
        assert(measJs.includes('cursor: grab'), 'Cursor grab deve ser ativado no hover do ponto');
    });
});
