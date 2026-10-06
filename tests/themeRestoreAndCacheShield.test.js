// tests/themeRestoreAndCacheShield.test.js
const assert = require('assert');

// 1. Catálogo de correspondência de arquivos locais
const LOCAL_GEOJSON_FALLBACKS = [
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.includes('ctm') || n.includes('cabedelo') || n.includes('municipal') || n.includes('base territorial');
        },
        files: ['Jeojson/Base_Cabedelo_V02.geojson', 'Jeojson/Base_Cabedelo.geojson'],
        estimatedCount: 20709
    },
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.startsWith('lpm') || n.includes('lpm');
        },
        files: ['Jeojson/LPM.geojson'],
        estimatedCount: 864
    },
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.startsWith('ltm') || n.startsWith('ltn') || n.includes('ltm') || n.includes('ltn');
        },
        files: ['Jeojson/LTN.geojson'],
        estimatedCount: 784
    },
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.includes('poligono');
        },
        files: ['Jeojson/Poligonos.geojson'],
        estimatedCount: 327
    },
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.includes('loteamento') || n.includes('invasao');
        },
        files: ['Jeojson/Invasao.geojson'],
        estimatedCount: 31
    },
    {
        matches: (name) => {
            const n = String(name || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            return n.includes('mpf') || n.includes('imoveis');
        },
        files: ['Jeojson/Imoveis_MPF_V04.geojson'],
        estimatedCount: 283
    }
];

function getThemeEstimatedCount(theme) {
    if (!theme) return null;
    if (typeof theme._cachedCount === 'number' && theme._cachedCount > 0) return theme._cachedCount;
    if (theme.metadata && typeof theme.metadata.featureCount === 'number' && theme.metadata.featureCount > 0) return theme.metadata.featureCount;
    if (theme.metadata && typeof theme.metadata.total_features === 'number' && theme.metadata.total_features > 0) return theme.metadata.total_features;
    const name = theme.name || '';
    const fb = LOCAL_GEOJSON_FALLBACKS.find(f => f.matches(name));
    return fb ? fb.estimatedCount : null;
}

// Teste 1: Estimativas para camadas com lazy-loading inativo
console.log('Executando testes de estimativa e blindagem de cache...');

const ctmTheme = { id: 'ctm-1', name: 'CTM-MUNICIPAL', features: [] };
assert.strictEqual(getThemeEstimatedCount(ctmTheme), 20709, 'CTM-MUNICIPAL deve estimar 20.709 feições da Base Cabedelo');

const lpmTheme = { id: 'lpm-1', name: 'LPM', features: [] };
assert.strictEqual(getThemeEstimatedCount(lpmTheme), 864, 'LPM deve estimar 864 feições');

const ltmTheme = { id: 'ltm-1', name: 'LTM', features: [] };
assert.strictEqual(getThemeEstimatedCount(ltmTheme), 784, 'LTM deve estimar 784 feições');

const loteamentoTheme = { id: 'lot-1', name: 'LIMITE LOTEAMENTOS', features: [] };
assert.strictEqual(getThemeEstimatedCount(loteamentoTheme), 31, 'LIMITE LOTEAMENTOS deve estimar 31 feições');

// Teste 2: Prioridade para contagem real em cache IndexedDB
const cachedTheme = { id: 'custom-1', name: 'Camada Custom', _cachedCount: 1500, features: [] };
assert.strictEqual(getThemeEstimatedCount(cachedTheme), 1500, '_cachedCount deve ter prioridade sobre fallback');

// Teste 3: Lógica de blindagem contra invalidação indevida por banco vazio (0)
function evaluateCacheInvalidation(countRes, cachedLength) {
    const realDbCount = countRes.count;
    let shouldInvalidate = false;
    // Nova regra blindada:
    if (!countRes.error && typeof realDbCount === 'number' && realDbCount > 0 && realDbCount > cachedLength) {
        shouldInvalidate = true;
    }
    return shouldInvalidate;
}

// Se o Supabase responder 0 feições (banco vazio, sem sync ou RLS), NÃO pode invalidar o cache local
const bankZeroRes = { count: 0, error: null };
const cachedCount20709 = 20709;
assert.strictEqual(
    evaluateCacheInvalidation(bankZeroRes, cachedCount20709),
    false,
    'Banco retornando 0 feições JAMAIS pode invalidar o cache local de 20.709 feições!'
);

// Se o banco responder mais feições (ex: 21.000 vs 20.709), aí sim invalida para buscar novidades
const bankMoreRes = { count: 21000, error: null };
assert.strictEqual(
    evaluateCacheInvalidation(bankMoreRes, cachedCount20709),
    true,
    'Banco retornando contagem maior deve invalidar para sincronizar'
);

// Teste 4: Preservação de cache se a rede retornar 0 linhas
let theme = { id: 'ctm-1', name: 'CTM-MUNICIPAL', features: [] };
const cachedData = { features: new Array(20709).fill({ type: 'Feature' }) };
const allRowsFromNetwork = []; // Nuvem retornou 0

if (allRowsFromNetwork.length === 0 && (!theme.features || theme.features.length === 0)) {
    if (cachedData && cachedData.features && cachedData.features.length > 0) {
        theme.features = cachedData.features;
    }
}
assert.strictEqual(theme.features.length, 20709, 'Feições locais devem ser preservadas integralmente quando a nuvem retorna 0');

console.log('✓ Todos os testes de blindagem de cache e restauração passaram com 100% de sucesso!');
