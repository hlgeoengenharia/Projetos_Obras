// tests/reportsTab.test.js
// Aba do tipo "Relatórios (A4)": no popup da feição mostra só os botões dos modelos do cadastro.
// Rodar com: node tests/reportsTab.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }

function render(tabs, templates, isEditMode) {
    const container = { innerHTML: '' };
    const window = {
        ReportAdapter: { getReportTemplates: () => templates },
        canSeeFormTab: () => true,
        canEditFormTab: () => true
    };
    const ctx = {
        window,
        document: { getElementById: () => container },
        localStorage: { getItem: () => '[]' },
        console
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'formRenderer.js'), 'utf8'), ctx);
    window.renderDynamicForm(tabs, {}, !!isEditMode, 'c', { formId: 'f1' });
    return container.innerHTML;
}

const tabs = [
    { id: 't1', title: 'Dados', isPrimary: true, fields: [{ id: 'a', label: 'Nome', type: 'text' }] },
    { id: 't_rel', title: 'Relatórios', tabType: 'reports', isReportsTab: true, fields: [] }
];
const tpls = [
    { id: 'r1', form_id: 'f1', tipo: 'individual', nome: 'Ficha Individual', atalho_aba: 'header' },
    { id: 'r2', form_id: 'f1', tipo: 'individual', nome: 'Laudo <b>MPF</b>', atalho_aba: 't1' },
    { id: 'r3', form_id: 'f1', tipo: 'individual', nome: 'Oculto', atalho_aba: 'none' },
    { id: 'r4', form_id: 'f1', tipo: 'geral', nome: 'Relatório da Camada', atalho_aba: 'none' },
    { id: 'r5', form_id: 'f1', tipo: 'geral', nome: 'Geral da Camada', atalho_aba: 'header' },
    { id: 'r6', form_id: 'OUTRO', tipo: 'individual', nome: 'De outro cadastro', atalho_aba: 'header' }
];

const html = render(tabs, tpls);
const relStart = html.indexOf('id="acc-content-t_rel"');
const relBody = html.slice(relStart);
ok('aba de relatórios foi renderizada', relStart > 0);
ok('mostra os relatórios individuais do cadastro (mesmo os vinculados a outra aba)', relBody.includes('Ficha Individual') && relBody.includes('Laudo &lt;b&gt;MPF&lt;/b&gt;'));
ok('nome do relatório é escapado', !relBody.includes('<b>MPF</b>'));
ok('não mostra os marcados como "Não exibir atalho no mapa"', !relBody.includes('Oculto'));
ok('não mostra relatórios gerais (de camada) nem de outro cadastro', !relBody.includes('Geral da Camada') && !relBody.includes('De outro cadastro'));
ok('cada botão emite o modelo certo', relBody.includes("printActiveFeatureReport('r1')") && relBody.includes("printActiveFeatureReport('r2')"));
ok('aba de relatórios não tem botão "Editar esta aba"', !relBody.includes('Editar esta aba'));

// as outras abas continuam iguais: atalho só do modelo vinculado a ela
const dadosBody = html.slice(html.indexOf('id="acc-content-t1"'), relStart);
ok('aba comum mantém o atalho do modelo vinculado a ela', dadosBody.includes('Laudo &lt;b&gt;MPF&lt;/b&gt;') && dadosBody.includes('Editar esta aba'));
ok('aba comum não recebe os demais botões', !dadosBody.includes('Ficha Individual'));

// sem modelos: mensagem
const vazio = render(tabs, []);
ok('sem relatórios mostra aviso', vazio.slice(vazio.indexOf('id="acc-content-t_rel"')).includes('Nenhum relatório A4 disponível'));

// modo edição: aba de relatórios não vira formulário
const edit = render(tabs, tpls, true);
const relEdit = edit.slice(edit.indexOf('id="acc-content-t_rel"'));
ok('modo edição não abre campos nem "Salvar" na aba de relatórios', !relEdit.includes('saveFeatureData') && relEdit.includes('Ficha Individual'));

console.log(`reportsTab: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
