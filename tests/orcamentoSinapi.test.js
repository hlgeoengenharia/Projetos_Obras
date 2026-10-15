// tests/orcamentoSinapi.test.js
// Bateria de Testes Unitários de Engenharia de Custos: Orçamento de Obras & Cronograma Físico-Financeiro
// Execução: node tests/orcamentoSinapi.test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
    total++;
    try {
        fn();
        passed++;
        console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ✗ [FAIL] ${name}\n    ↳ ${err.message}`);
    }
}

console.log('\n--- INICIANDO TESTES DO MÓDULO DE ORÇAMENTO E CRONOGRAMA ---');

// Carrega os arquivos fontes para inspeção estática e contexto VM
const orcamentoCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'orcamento.js'), 'utf8');
const formRendererCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'formRenderer.js'), 'utf8');
const indexHtmlCode = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function criarContextoBrowser(customDom = {}) {
    const domStore = Object.assign({}, customDom);
    const ctx = {
        window: {
            GeoOrcamento: {}
        },
        document: {
            getElementById: (id) => domStore[id] || null,
            querySelectorAll: () => [],
            addEventListener: () => {},
            removeEventListener: () => {}
        },
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] || null; },
            setItem(k, v) { this._store[k] = String(v); }
        },
        fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
        parseFloat: parseFloat,
        parseInt: parseInt,
        Math: Math,
        Number: Number,
        console: { log: () => {}, warn: () => {}, error: () => {} }
    };
    ctx.window.window = ctx.window;
    ctx.window.document = ctx.document;
    ctx.window.localStorage = ctx.localStorage;
    ctx.window.fetch = ctx.fetch;

    vm.createContext(ctx);
    vm.runInContext(orcamentoCode, ctx);
    return { ctx, domStore };
}

// -------------------------------------------------------------------------------------
// TESTE 1: Remoção do selo "SINAPI OFICIAL" do card de orçamento e do cabeçalho
// -------------------------------------------------------------------------------------
test('Card da Aba Orçamento de Obras não exibe o selo "SINAPI OFICIAL"', () => {
    const orcSection = formRendererCode.slice(formRendererCode.indexOf('if (isOrcamento) {'), formRendererCode.indexOf('// Aba de Relatórios:'));
    assert.strictEqual(orcSection.includes('SINAPI OFICIAL'), false, 'O selo SINAPI OFICIAL ainda está presente no card de orçamento de formRenderer.js');
    assert.strictEqual(orcSection.includes('card-orcamento-bdi-tag'), true, 'Deveria conter card-orcamento-bdi-tag no card de orçamento');
    assert.strictEqual(orcSection.includes('card-orcamento-valor-total'), true, 'Deveria conter card-orcamento-valor-total');
});

test('Cabeçalho do Modal de Orçamento em index.html não exibe selo "SINAPI OFICIAL" duplicado', () => {
    const modalHeader = indexHtmlCode.slice(indexHtmlCode.indexOf('id="orcamento-modal-title"'), indexHtmlCode.indexOf('id="orcamento-modal-subtitle"'));
    assert.strictEqual(modalHeader.includes('SINAPI OFICIAL'), false, 'O selo SINAPI OFICIAL no cabeçalho do modal deveria ter sido removido');
});

// -------------------------------------------------------------------------------------
// TESTE 2: Sincronização do "Valor total estimado" com "Total com BDI"
// -------------------------------------------------------------------------------------
test('sincronizarCardOrcamento atualiza valor com BDI e tag no DOM e nas propriedades', () => {
    const dom = {
        'card-orcamento-valor-total': { textContent: 'R$ 0,00' },
        'card-orcamento-bdi-tag': { textContent: '' }
    };

    const mockFeature = {
        feature: {
            properties: {
                id_banco: 'obra_123',
                'Nome da Obra': 'Pavimentação Av. Beira Mar'
            }
        }
    };

    const { ctx, domStore } = criarContextoBrowser(dom);
    ctx.window.GeoOrcamento.activeFeature = mockFeature;
    ctx.window.activeFeatureLayer = mockFeature;

    const orcSimulado = {
        valorTotalComBdi: 998.26,
        bdiPercentual: 0.248,
        dataBaseSinapi: '07/2026'
    };

    ctx.window.sincronizarCardOrcamento(orcSimulado);

    assert.strictEqual(domStore['card-orcamento-valor-total'].textContent, 'R$ 998,26', 'Card deveria exibir R$ 998,26');
    assert.ok(domStore['card-orcamento-bdi-tag'].textContent.includes('24,80%'), 'Tag de BDI deveria indicar 24,80%');
    assert.strictEqual(mockFeature.feature.properties['Valor Total da Obra (R$)'], '998,26');
    assert.strictEqual(mockFeature.feature.properties['valor_total_obra'], '998,26');
    assert.strictEqual(mockFeature.feature.properties['BDI (%)'], '24,80%');
});

// -------------------------------------------------------------------------------------
// TESTE 3: Cálculo e Persistência de Totais com BDI (calcularTotais)
// -------------------------------------------------------------------------------------
test('calcularTotais calcula corretamente etapas e itens com BDI sem distorção', () => {
    const { ctx } = criarContextoBrowser();

    const orc = {
        bdiPercentual: 0.248, // 24.80%
        etapas: [
            {
                id: 'etp_1',
                codigo: '1.0',
                nome: 'SERVIÇOS PRELIMINARES',
                itens: [
                    { id: 'it_1', quantidade: 2, precoUnitarioSemBdi: 83.27 }, // unit c/ BDI: 103.92, tot: 207.84
                    { id: 'it_2', quantidade: 1, precoUnitarioSemBdi: 165.81 }, // unit c/ BDI: 206.93, tot: 206.93
                    { id: 'it_3', quantidade: 1, precoUnitarioSemBdi: 165.81 }  // unit c/ BDI: 206.93, tot: 206.93
                ]
            }
        ]
    };

    ctx.window.calcularTotaisOrcamento(orc);

    // Soma esperada: 207.84 + 206.93 + 206.93 = 621.70
    assert.strictEqual(orc.etapas[0].itens[0].precoUnitarioComBdi, 103.92);
    assert.strictEqual(orc.etapas[0].itens[0].precoTotal, 207.84);
    assert.strictEqual(orc.etapas[0].totalComBdi, 621.70);
    assert.strictEqual(orc.valorTotalComBdi, 621.70);
});

// -------------------------------------------------------------------------------------
// TESTE 4: Cronograma Físico-Financeiro com 2 casas decimais sem arredondamento truncado
// -------------------------------------------------------------------------------------
test('Cronograma Físico-Financeiro calcula valores mensais com 2 casas decimais exatas (R$ 99,83 e não R$ 100)', () => {
    const { ctx } = criarContextoBrowser();

    const orc = {
        prazoMeses: 6,
        valorTotalComBdi: 998.26,
        bdiPercentual: 0.248,
        etapas: [
            {
                id: 'etp_1',
                codigo: '1.0',
                nome: 'SERVIÇOS PRELIMINARES',
                totalComBdi: 998.26,
                itens: []
            }
        ],
        cronograma: {
            meses: 6,
            distribuicao: {
                'etp_1': [10.0, 20.0, 20.0, 20.0, 20.0, 10.0] // Soma = 100%
            }
        }
    };

    // Renderiza a aba cronograma e verifica o HTML gerado
    const html = vm.runInContext(`
        window.GeoOrcamento.orcamentoAtual = ${JSON.stringify(orc)};
        window.renderAbaCronograma(window.GeoOrcamento.orcamentoAtual);
    `, ctx);

    // Mês 1: 10% de 998,26 = R$ 99,83 (com 2 casas decimais)
    // O bug anterior formatava com { minimumFractionDigits: 0, maximumFractionDigits: 0 } gerando "R$ 100"
    assert.ok(html.includes('R$ 99,83'), 'Mês 1 (10% de 998,26) deve exibir R$ 99,83 e não R$ 100');
    assert.ok(!html.includes('R$ 100<'), 'Não deve exibir R$ 100 arredondado');

    // Mês 2: 20% de 998,26 = R$ 199,65
    assert.ok(html.includes('R$ 199,65'), 'Mês 2 (20% de 998,26) deve exibir R$ 199,65 e não R$ 200');

    // Total % deve exibir com 2 casas decimais: 100.00%
    assert.ok(html.includes('100.00%'), 'Total percentual deve exibir com 2 casas decimais: 100.00%');

    // Inputs devem aceitar step="0.01"
    assert.ok(html.includes('step="0.01"'), 'Inputs do cronograma devem permitir step="0.01" para decimais');
});

test('atualizarPercentualCronograma processa decimais com vírgula e ponto com precisão de 2 casas', () => {
    const { ctx } = criarContextoBrowser();

    ctx.window.GeoOrcamento.orcamentoAtual = {
        featureId: 'obra_test',
        prazoMeses: 6,
        valorTotalComBdi: 1000,
        bdiPercentual: 0.248,
        etapas: [{ id: 'etp_1', codigo: '1.0', nome: 'ETP 1', totalComBdi: 1000, itens: [] }],
        cronograma: { meses: 6, distribuicao: {} }
    };

    // Atualiza mês 0 com string de vírgula "33,33"
    ctx.window.atualizarPercentualCronograma('etp_1', 0, '33,33');
    assert.strictEqual(ctx.window.GeoOrcamento.orcamentoAtual.cronograma.distribuicao['etp_1'][0], 33.33);

    // Atualiza mês 1 com número decimal 16.67
    ctx.window.atualizarPercentualCronograma('etp_1', 1, 16.666);
    assert.strictEqual(ctx.window.GeoOrcamento.orcamentoAtual.cronograma.distribuicao['etp_1'][1], 16.67);
});

test('Exportação PDF do Cronograma formata valores monetários e percentuais com 2 casas decimais', () => {
    assert.ok(orcamentoCode.includes('${perc.toFixed(2)}%'), 'PDF do cronograma deve formatar percentuais com 2 casas decimais');
    assert.ok(orcamentoCode.includes("minimumFractionDigits: 2, maximumFractionDigits: 2"), 'PDF do cronograma deve formatar moeda com 2 casas decimais');
});

console.log(`\n======================================================`);
console.log(` Resultado dos Testes de Orçamento e Cronograma:`);
console.log(` Total:    ${total}`);
console.log(` Passaram: ${passed}`);
console.log(` Falharam: ${failed}`);
console.log(`======================================================\n`);

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
