const assert = require('assert');
const fs = require('fs');

console.log("Iniciando testes de exportação multi-feição e comparador temporal...");

// 1. Testa presença e estrutura no index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
assert(indexHtml.includes('startExportSelectionModal()'), 'index.html deve conter chamada para startExportSelectionModal() no menu de contexto');
assert(indexHtml.includes('id="export-selection-modal"'), 'index.html deve conter a modal export-selection-modal');
assert(indexHtml.includes('id="export-fields-list"'), 'index.html deve conter o container export-fields-list para seleção de campos');
assert(indexHtml.includes('id="export-dxf-coords-box"'), 'index.html deve conter configurações de CRS para DXF');
console.log('✓ index.html validado com sucesso.');

// 2. Testa presença e funções no relatorio.html
const relatorioHtml = fs.readFileSync('relatorio.html', 'utf8');
assert(relatorioHtml.includes('id="btn-export-kml-dropdown"'), 'relatorio.html deve conter o botão dropdown');
assert(relatorioHtml.includes('id="report-export-menu"'), 'relatorio.html deve conter o menu expandido');
assert(relatorioHtml.includes('selectReportExport(\'kml\')'), 'relatorio.html deve conter opção KML');
assert(relatorioHtml.includes('selectReportExport(\'geojson\')'), 'relatorio.html deve conter opção GeoJSON');
assert(relatorioHtml.includes('window.exportMeasurementsGeoJSON'), 'relatorio.html deve definir exportMeasurementsGeoJSON');
console.log('✓ relatorio.html validado com sucesso.');

// 3. Testa isolamento de scroll no swipe-comparator.js
const swipeJs = fs.readFileSync('src/swipe-comparator.js', 'utf8');
assert(swipeJs.includes('_dateDropdownEl.contains(e.target)'), 'swipe-comparator.js deve checar se wheel/touch está dentro do dropdown para permitir rolagem nativa');
assert(swipeJs.includes('L.DomEvent.disableScrollPropagation(_dateDropdownEl)'), 'swipe-comparator.js deve desabilitar propagação para o mapa');
console.log('✓ swipe-comparator.js validado com sucesso.');

// 4. Testa lógica de geração em main.js
const mainJs = fs.readFileSync('src/main.js', 'utf8');
assert(mainJs.includes('function generateGeoJsonForExport'), 'main.js deve conter generateGeoJsonForExport');
assert(mainJs.includes('function generateKmlForExport'), 'main.js deve conter generateKmlForExport');
assert(mainJs.includes('function generateDxfForExport'), 'main.js deve conter generateDxfForExport');

// Executa um teste unitário simulando a geração de dados
const testFeatures = [
    {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[[-34.83, -7.02], [-34.82, -7.02], [-34.82, -7.03], [-34.83, -7.03], [-34.83, -7.02]]]
        },
        properties: {
            inscricao: '118',
            bairro: 'Intermares',
            proprietario: 'João Silva',
            area_m2: '250',
            ignorar_este: 'nao_exportar'
        }
    },
    {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [-34.835, -7.025]
        },
        properties: {
            inscricao: '119',
            bairro: 'Intermares',
            proprietario: 'Maria Souza',
            area_m2: '0',
            ignorar_este: 'nao_exportar'
        }
    }
];

const selectedFields = ['inscricao', 'bairro', 'proprietario'];

// Avalia a geração no contexto
const evalScope = {};
const funcExtract = mainJs.slice(mainJs.indexOf('function generateGeoJsonForExport'), mainJs.indexOf('// --- LEAFLET MAP ---'));
eval(`(function(scope) { ${funcExtract}; scope.generateGeoJsonForExport = generateGeoJsonForExport; scope.generateKmlForExport = generateKmlForExport; scope.generateDxfForExport = generateDxfForExport; })(evalScope);`);

// GeoJSON check
const geoJsonRes = JSON.parse(evalScope.generateGeoJsonForExport(testFeatures, selectedFields, 'Teste_Camada'));
assert.strictEqual(geoJsonRes.features.length, 2, 'GeoJSON deve conter 2 feições');
assert.strictEqual(geoJsonRes.features[0].properties.inscricao, '118');
assert.strictEqual(geoJsonRes.features[0].properties.ignorar_este, undefined, 'Campo não selecionado não deve estar no GeoJSON');
console.log('✓ generateGeoJsonForExport testado e validado.');

// KML check
const kmlRes = evalScope.generateKmlForExport(testFeatures, selectedFields, 'Teste_Camada');
assert(kmlRes.includes('<name>Teste_Camada</name>'));
assert(kmlRes.includes('<Polygon>'));
assert(kmlRes.includes('<Point>'));
assert(kmlRes.includes('<Data name="inscricao"><value>118</value></Data>'));
assert(!kmlRes.includes('ignorar_este'), 'Campo não selecionado não deve estar no KML');
console.log('✓ generateKmlForExport testado e validado.');

// DXF check
const dxfRes = evalScope.generateDxfForExport(testFeatures, selectedFields, 'wgs84', 'Teste_Camada');
assert(dxfRes.includes('SECTION\r\n2\r\nHEADER'));
assert(dxfRes.includes('POLYLINE'));
assert(dxfRes.includes('POINT'));
assert(dxfRes.includes('EOF'));
console.log('✓ generateDxfForExport testado e validado.');

console.log("\nTodos os testes passaram com 100% de sucesso!");
