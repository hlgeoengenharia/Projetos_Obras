// tests/reportDefaultMapConfig.test.js
// Testa a persistência e herança das configurações padrão do mapa configuradas na prévia do relatório individual.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let passed = 0;

function test(desc, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✓ [PASS] ${desc}`);
    } catch (e) {
        console.error(`  ✗ [FAIL] ${desc}`);
        console.error(`    ↳ ${e.message}`);
    }
}

console.log('\n--- TESTES: Configuração Padrão do Mapa no Preview do Relatório Individual ---');

const relatorioHtml = fs.readFileSync(path.join(__dirname, '..', 'relatorio_view.html'), 'utf8');
const reportBuilderJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'reportBuilder.js'), 'utf8');

test('relatorio_view.html contém botão e banner "Salvar como Padrão do Modelo" na prévia', () => {
    assert.ok(relatorioHtml.includes('Salvar como Padrão do Modelo'), 'Deve conter botão "Salvar como Padrão do Modelo"');
    assert.ok(relatorioHtml.includes('Padrão da Ficha Individual'), 'Deve conter título "Padrão da Ficha Individual"');
    assert.ok(relatorioHtml.includes('salvarPadraoDoModelo()'), 'Deve chamar salvarPadraoDoModelo()');
});

test('relatorio_view.html contém lógica de salvarPadraoDoModelo atualizando o bloco mapa_estatico e localStorage', () => {
    assert.ok(relatorioHtml.includes('async function salvarPadraoDoModelo()'), 'Função salvarPadraoDoModelo deve existir');
    assert.ok(relatorioHtml.includes("blocoMapa.mapa = JSON.parse(JSON.stringify(snap))"), 'Deve gravar snapshot do mapa no bloco');
    assert.ok(relatorioHtml.includes("localStorage.setItem('constructive_report_templates'"), 'Deve atualizar localStorage');
    assert.ok(relatorioHtml.includes("relatorio:padrao_mapa_salvo"), 'Deve notificar a janela do construtor');
});

test('reportBuilder.js escuta mensagem "relatorio:padrao_mapa_salvo" para sincronizar modelo aberto', () => {
    assert.ok(reportBuilderJs.includes("relatorio:padrao_mapa_salvo"), 'Construtor deve escutar a mensagem de padrão salvo');
    assert.ok(reportBuilderJs.includes("currentTemplate.config_mapa_padrao"), 'Deve guardar config_mapa_padrao no currentTemplate');
});

test('Simulação: salvarPadraoDoModelo grava o mapa no template e a feição herda como padrão', () => {
    const mockStorage = {};
    const tplId = 'rpt_teste_orla';
    const formId = 'form_orla_123';
    
    const initialTemplate = {
        id: tplId,
        form_id: formId,
        nome: 'Barracas cadastradas (Ficha Individual)',
        tipo: 'individual',
        blocos: [
            { id: 'b1', tipo: 'cabecalho', titulo: 'FICHA CADASTRAL' },
            { id: 'b2', tipo: 'mapa_estatico', titulo: 'Delimitação Cartográfica' }
        ]
    };
    mockStorage['constructive_report_templates'] = JSON.stringify([initialTemplate]);

    // Simula as configurações formatadas na prévia pelo usuário
    const configFormatadaNaPrevia = {
        baseMap: 'satelite',
        norte: true,
        escala: true,
        projecao: true,
        alturaMm: 110,
        destaque: { ativo: true, cor: '#f59e0b', espessura: 4, preenchimento: 0.35, esmaecerEntorno: true, opacidadeEntorno: 0.7 },
        camadasLigadas: ['camada_quiosques', 'camada_passarela'],
        pontos: { ativo: true, cor: '#dc2626', tabela: true, memorial: true, sistema: 'utm' },
        medidas: { ativo: true, lados: true, total: true, perimetro: true, cor: '#047857' }
    };

    // Executa a lógica de persistência do padrão no template
    const templates = JSON.parse(mockStorage['constructive_report_templates']);
    const target = templates.find(t => t.id === tplId);
    assert.ok(target, 'Template deve ser encontrado');

    let blocoMapa = target.blocos.find(b => b.tipo === 'mapa_estatico');
    blocoMapa.mapa = JSON.parse(JSON.stringify(configFormatadaNaPrevia));
    blocoMapa.alturaMm = configFormatadaNaPrevia.alturaMm;
    target.config_mapa_padrao = JSON.parse(JSON.stringify(configFormatadaNaPrevia));

    mockStorage['constructive_report_templates'] = JSON.stringify(templates);

    // Agora simula a abertura da feição real no mapa:
    const reloadedTemplates = JSON.parse(mockStorage['constructive_report_templates']);
    const loadedTpl = reloadedTemplates.find(t => t.id === tplId);
    const loadedBlocoMapa = loadedTpl.blocos.find(b => b.tipo === 'mapa_estatico');

    const MapTools = require('../src/mapTools.js');
    const normalized = MapTools.normalizeMapConfig(loadedBlocoMapa);

    assert.strictEqual(normalized.baseMap, 'satelite', 'Mapa base deve ser satélite como salvo na prévia');
    assert.strictEqual(normalized.alturaMm, 110, 'Altura deve ser 110 mm como salvo na prévia');
    assert.strictEqual(normalized.destaque.cor, '#f59e0b', 'Cor de destaque deve ser #f59e0b');
    assert.strictEqual(normalized.destaque.espessura, 4, 'Espessura de destaque deve ser 4');
    assert.strictEqual(normalized.destaque.esmaecerEntorno, true, 'Esmaecer entorno deve ser true');
    assert.deepStrictEqual(normalized.camadasLigadas, ['camada_quiosques', 'camada_passarela'], 'Camadas ligadas devem ser preservadas');
    assert.strictEqual(normalized.pontos.ativo, true, 'Pontos nos vértices devem estar ativos');
    assert.strictEqual(normalized.pontos.tabela, true, 'Tabela de pontos deve estar ativa');
    assert.strictEqual(normalized.medidas.ativo, true, 'Medições na feição devem estar ativas');
});

console.log(`\nResultado: ${passed}/${total} verificações passaram.`);
if (passed !== total) process.exit(1);
