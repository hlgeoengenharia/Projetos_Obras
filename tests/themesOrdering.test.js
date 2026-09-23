const assert = require('assert');

// Mock localStorage
const storage = {};
global.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
};

// Mock DOM & window
global.window = {
    activeMunicipioId: 'mun_test_1',
    activeWorkspaceThemes: ['theme_2', 'theme_1', 'theme_3'],
    userProjects: []
};
global.activeMunicipioId = 'mun_test_1';

// Import / define applySavedThemesOrder logic as in src/main.js
function saveThemesCustomOrder(themesList) {
    const munId = global.window.activeMunicipioId || 'default';
    if (Array.isArray(themesList)) {
        const allThemeIds = themesList.map(t => String(t.id));
        global.localStorage.setItem(`constructive_themes_order_${munId}`, JSON.stringify(allThemeIds));
    }
}

function applySavedThemesOrder(themesList) {
    if (!Array.isArray(themesList) || themesList.length <= 1) return;

    const munId = global.window.activeMunicipioId || 'default';

    let workspaceOrder = [];
    if (Array.isArray(global.window.activeWorkspaceThemes) && global.window.activeWorkspaceThemes.length > 0) {
        workspaceOrder = global.window.activeWorkspaceThemes.map(id => String(id));
    }

    let customOrder = [];
    try {
        const savedOrder = global.localStorage.getItem(`constructive_themes_order_${munId}`);
        if (savedOrder) customOrder = JSON.parse(savedOrder).map(id => String(id));
    } catch(e) {}

    const fullOrder = [...new Set([...workspaceOrder, ...customOrder])];
    if (fullOrder.length === 0) return;

    themesList.sort((a, b) => {
        const idA = String(a.id);
        const idB = String(b.id);
        const idxA = fullOrder.indexOf(idA);
        const idxB = fullOrder.indexOf(idB);

        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });
}

// TEST 1: Initial unsorted database return is sorted according to activeWorkspaceThemes
let testThemes = [
    { id: 'theme_1', name: 'Loteamentos' },
    { id: 'theme_2', name: 'Imóveis Orla' },
    { id: 'theme_3', name: 'LTM' },
    { id: 'theme_4', name: 'Outro Não No Workspace' }
];

applySavedThemesOrder(testThemes);

assert.strictEqual(testThemes[0].id, 'theme_2', 'theme_2 deve vir em primeiro conforme workspace');
assert.strictEqual(testThemes[1].id, 'theme_1', 'theme_1 deve vir em segundo conforme workspace');
assert.strictEqual(testThemes[2].id, 'theme_3', 'theme_3 deve vir em terceiro conforme workspace');
assert.strictEqual(testThemes[3].id, 'theme_4', 'theme_4 não está no workspace e deve ficar no final');

// TEST 2: Drag and drop reordering
// User moves theme_3 to the top
const draggedId = 'theme_3';
const targetId = 'theme_2';
const fromIdx = testThemes.findIndex(t => t.id === draggedId);
const [dragged] = testThemes.splice(fromIdx, 1);
const toIdx = testThemes.findIndex(t => t.id === targetId);
testThemes.splice(toIdx, 0, dragged);

// Update activeWorkspaceThemes as done in drag handler
const wsFrom = global.window.activeWorkspaceThemes.indexOf(draggedId);
const [movedWs] = global.window.activeWorkspaceThemes.splice(wsFrom, 1);
const wsTo = global.window.activeWorkspaceThemes.indexOf(targetId);
global.window.activeWorkspaceThemes.splice(wsTo, 0, movedWs);

saveThemesCustomOrder(testThemes);

assert.deepStrictEqual(global.window.activeWorkspaceThemes, ['theme_3', 'theme_2', 'theme_1'], 'Workspace deve ter theme_3 no topo');
const savedInStorage = JSON.parse(global.localStorage.getItem('constructive_themes_order_mun_test_1'));
assert.strictEqual(savedInStorage[0], 'theme_3', 'Storage deve ter theme_3 no topo');

// TEST 3: System reload simulation
// Suppose user reloads page and Postgres returns themes in arbitrary order again:
let reloadedThemes = [
    { id: 'theme_1', name: 'Loteamentos' },
    { id: 'theme_4', name: 'Outro' },
    { id: 'theme_2', name: 'Imóveis Orla' },
    { id: 'theme_3', name: 'LTM' }
];

applySavedThemesOrder(reloadedThemes);

assert.strictEqual(reloadedThemes[0].id, 'theme_3', 'Após reload, theme_3 continua em primeiro');
assert.strictEqual(reloadedThemes[1].id, 'theme_2', 'Após reload, theme_2 continua em segundo');
assert.strictEqual(reloadedThemes[2].id, 'theme_1', 'Após reload, theme_1 continua em terceiro');
assert.strictEqual(reloadedThemes[3].id, 'theme_4', 'Após reload, theme_4 continua em quarto');

console.log('✓ Testes de persistência de ordenação das camadas executados com sucesso!');
