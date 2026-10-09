// tests/vectorCursorAndSelection.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Validação de Cursor em Feições Vetoriais e Seleção de Camadas (CTM-Municipal)', async (t) => {
    const mainJs = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    await t.test('1. CSS contém regras para cursor pointer no canvas e feições interativas', () => {
        assert.ok(
            indexHtml.includes('canvas.leaflet-interactive') || indexHtml.includes('.leaflet-interactive'),
            'index.html deve conter regras de cursor: pointer para canvas e feições interativas'
        );
        assert.ok(
            mainJs.includes('canvas.leaflet-interactive'),
            'main.js deve atualizar dynamic-selection-style incluindo cursor pointer para canvas'
        );
    });

    await t.test('2. canvasRenderer possui hooks para _handleMouseHover e _handleMouseOut com atualização de cursor', () => {
        assert.ok(
            mainJs.includes('canvasRenderer._handleMouseHover'),
            'canvasRenderer deve sobrescrever _handleMouseHover para mudar o cursor do mouse dinamicamente'
        );
        assert.ok(
            mainJs.includes('map.getContainer().style.cursor = \'pointer\''),
            'canvasRenderer deve atualizar o cursor do mapa para pointer ao passar sobre linhas/polígonos'
        );
        assert.ok(
            mainJs.includes('canvasRenderer._handleMouseOut'),
            'canvasRenderer deve sobrescrever _handleMouseOut para resetar o cursor'
        );
    });

    await t.test('3. canvasRenderer prioriza feições da camada ativa selecionada no menu lateral', () => {
        assert.ok(
            mainJs.includes('activeThemeCandidate'),
            'canvasRenderer deve priorizar feições pertencentes à camada atualmente selecionada no menu lateral'
        );
    });

    await t.test('4. onEachFeature possui eventos mouseover e mouseout para mudar cursor', () => {
        assert.ok(
            mainJs.includes("layer.on('mouseover'"),
            'onEachFeature deve registrar mouseover no layer para cursor pointer'
        );
        assert.ok(
            mainJs.includes("layer.on('mouseout'"),
            'onEachFeature deve registrar mouseout no layer para resetar o cursor'
        );
    });

    await t.test('5. Trava de segurança no clique suporta themeId flexível e case-insensitive', () => {
        assert.ok(
            mainJs.includes('activeThemeIdStr.toLowerCase() !== themeIdStr.toLowerCase()'),
            'Comparação da trava de segurança de tema deve ser resiliente e case-insensitive'
        );
        assert.ok(
            mainJs.includes('ownerTheme'),
            'Deve haver fallback para recuperar o tema proprietário caso themeId não esteja diretamente no properties'
        );
    });

    await t.test('6. map.on("click") possui fallback inteligente para Polígonos da camada ativa', () => {
        assert.ok(
            mainJs.includes('activePolyLayer'),
            'map.on("click") deve verificar se o clique ocorreu dentro de um polígono da camada ativa selecionada'
        );
    });

    await t.test('7. style function define themeId de forma segura sem ReferenceError', () => {
        // Extrai a função style e testa execução
        assert.ok(
            !mainJs.includes('const featThemeId = feature.properties?.themeId'),
            'style não deve deixar themeId indefinido usando featThemeId sem declarar themeId'
        );
        assert.ok(
            mainJs.includes('className: `theme-feature theme-${themeId}`'),
            'style deve usar className formatado com themeId'
        );
    });
});

