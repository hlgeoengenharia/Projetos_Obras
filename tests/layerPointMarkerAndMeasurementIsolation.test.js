const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('Validação de Isolamento de Marcador de Camada e Medição', async (t) => {
    const mainJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    const measJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'measurement.js'), 'utf8');

    await t.test('1. measurement.js pm:create possui guarda contra captura indevida de feições de camadas', () => {
        assert(measJs.includes('if (!window.isMeasurementActive || !currentMeasurementMode)'), 'Deve verificar se medição está ativa');
        assert(measJs.includes('editingThemeId'), 'Deve verificar se uma camada está sendo editada');
    });

    await t.test('2. measurement.js saveMeasurementPDF evita estouro de cota do localStorage', () => {
        assert(measJs.includes('window._measurementReportData = reportData'), 'Deve salvar dados completos na memória RAM');
        assert(measJs.includes('features: []'), 'Deve esvaziar feições volumosas no fallback de localStorage');
        assert(measJs.includes('catch(eQuota)'), 'Deve capturar erro de cota graciosamente');
    });

    await t.test('3. main.js possui construtor de ícone 3D da camada window.getThemeMarkerDivIcon', () => {
        assert(mainJs.includes('window.getThemeMarkerDivIcon = function(theme, colorOverride)'), 'getThemeMarkerDivIcon deve existir globalmente');
        assert(mainJs.includes('map-pin-3d-marker'), 'Deve gerar o pino 3D da camada');
        assert(mainJs.includes('pointToLayer: function(feature, latlng)'), 'pointToLayer deve usar getThemeMarkerDivIcon');
    });

    await t.test('4. main.js setDrawingMode("marker") aplica o ícone do tema ao cursor do Geoman', () => {
        assert(mainJs.includes("if (mode === 'marker')"), 'setDrawingMode deve tratar marker especificamente');
        assert(mainJs.includes('markerStyle:') && mainJs.includes('icon: customIcon'), 'setDrawingMode deve repassar markerStyle com icon');
    });

    await t.test('5. main.js deleteActiveFeature remove marcadores órfãos residuais de medição', () => {
        assert(mainJs.includes('window.measurementLayerGroup && targetLayer'), 'deleteActiveFeature deve verificar measurementLayerGroup');
        assert(mainJs.includes('window.measurementLayerGroup.removeLayer(l)'), 'deleteActiveFeature deve remover marcador órfão da mesma coordenada');
    });
});
