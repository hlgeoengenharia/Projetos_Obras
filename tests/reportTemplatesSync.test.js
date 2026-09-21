// tests/reportTemplatesSync.test.js
// Modelos de relatório entre navegadores: baixar do servidor o que falta, enviar o que só existe aqui,
// guardar o atalho_aba junto (config_pagina._extras) e reabrir o circuito quando a tabela passa a existir.
// Rodar com: node tests/reportTemplatesSync.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

function makeEnv(client, iniciais) {
    const store = Object.assign({}, iniciais || {});
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const eventos = [];
    const window = { localStorage, dispatchEvent: (e) => { eventos.push(e); return true; } };
    window.window = window;
    const ctx = { window, localStorage, console: { log() {}, info() {}, warn() {}, error() {} }, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; } };
    if (client) ctx.supabaseClient = client;
    ctx.self = window;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'reportAdapter.js'), 'utf8'), ctx);
    return { A: window.ReportAdapter, store, eventos };
}

// Supabase simulado: tabela relatorios_templates com linhas por id; sessão opcional; tabela pode não existir
function fakeClient(opts) {
    opts = opts || {};
    const rows = Object.assign({}, opts.rows || {});
    const c = { rows, selects: 0, upserts: [], sessao: opts.sessao !== false, semTabela: !!opts.semTabela };
    c.auth = { getSession: async () => ({ data: { session: c.sessao ? { user: { id: 'u1' } } : null } }) };
    c.from = (tabela) => {
        if (tabela !== 'relatorios_templates') throw new Error('tabela inesperada ' + tabela);
        return {
            select: async () => { c.selects++; return c.semTabela ? { data: null, error: { code: 'PGRST205', message: 'not found' } } : { data: Object.values(rows), error: null }; },
            upsert: async (row) => { c.upserts.push(row); if (c.semTabela) return { error: { code: 'PGRST205', message: 'not found' } }; rows[row.id] = row; return { error: null }; },
            delete: () => ({ eq: async () => ({ error: null }) })
        };
    };
    return c;
}

const linhaServidor = (id, extras, quando, nome) => ({ id: id, form_id: 'f1', nome: nome || 'Ficha do servidor', tipo: 'individual', disponibilizar_no_mapa: true, config_pagina: { tamanho: 'A4', orientacao: 'portrait', _extras: extras || {} }, blocos: [{ id: 'b1', tipo: 'cabecalho' }], updated_at: quando || '2026-09-20T10:00:00+00:00' });
const modeloLocal = (id, quando, nome) => ({ id: id, form_id: 'f1', nome: nome || 'Ficha local', tipo: 'individual', disponibilizar_no_mapa: true, atalho_aba: 'header', config_pagina: { tamanho: 'A4' }, blocos: [{ id: 'b9', tipo: 'mapa_estatico' }], updatedAt: quando || '2026-09-20T09:00:00.000Z' });
const guardado = (env) => JSON.parse(env.store.constructive_report_templates || '[]');

(async () => {
    // ---------------------------------------------------------------- baixar: outro navegador sem nada local
    {
        const cli = fakeClient({ rows: { r1: linhaServidor('r1', { atalho_aba: 'todas', escopo: 'individual' }) } });
        const env = makeEnv(cli);
        eq('antes de sincronizar, o navegador novo não tem modelo nenhum', env.A.getReportTemplates('f1'), []);
        const r = await env.A.syncTemplates();
        eq('baixa o modelo do servidor', [r.ok, r.baixados, r.enviados], [true, 1, 0]);
        const t = env.A.getReportTemplates('f1')[0];
        ok('modelo vem completo: nome, tipo, blocos, página e o atalho_aba guardado nos extras', t.id === 'r1' && t.nome === 'Ficha do servidor' && t.tipo === 'individual' && t.atalho_aba === 'todas' && t.escopo === 'individual' && t.blocos.length === 1 && t.config_pagina.tamanho === 'A4' && !('_extras' in t.config_pagina) && t.updatedAt === '2026-09-20T10:00:00+00:00');
        eq('avisa a página que chegaram modelos', [env.eventos.length, env.eventos[0].type, env.eventos[0].detail.baixados], [1, 'report-templates-synced', 1]);
        eq('modelo de outro cadastro não aparece neste', env.A.getReportTemplates('outro'), []);
    }

    // ---------------------------------------------------------------- enviar: o que só existe aqui sobe, com o atalho_aba junto
    {
        const cli = fakeClient();
        const env = makeEnv(cli, { constructive_report_templates: JSON.stringify([modeloLocal('l1')]), constructive_remote_templates_available: 'false' });
        const r = await env.A.syncTemplates();
        eq('envia o modelo que só existia neste navegador', [r.ok, r.baixados, r.enviados, cli.upserts.length], [true, 0, 1, 1]);
        const up = cli.upserts[0];
        ok('linha enviada: colunas, blocos e o resto (atalho_aba) dentro de config_pagina._extras', up.id === 'l1' && up.form_id === 'f1' && up.tipo === 'individual' && up.blocos[0].id === 'b9' && up.config_pagina.tamanho === 'A4' && up.config_pagina._extras.atalho_aba === 'header' && !('blocos' in up.config_pagina._extras) && up.updated_at === '2026-09-20T09:00:00.000Z');
        eq('o circuito que estava fechado ("false") é reaberto porque a tabela existe', env.store.constructive_remote_templates_available, 'true');
        eq('nada foi baixado: sem aviso à página', env.eventos.length, 0);
        // ida e volta: outro navegador recebe igual
        const env2 = makeEnv(cli);
        await env2.A.syncTemplates();
        eq('ida e volta: o outro navegador recebe o modelo com o mesmo atalho_aba', [env2.A.getReportTemplates('f1').map(t => [t.id, t.atalho_aba, t.nome])], [[['l1', 'header', 'Ficha local']]]);
    }

    // ---------------------------------------------------------------- o mais novo vence, nos dois sentidos
    {
        const cli = fakeClient({ rows: { a: linhaServidor('a', { atalho_aba: 'x' }, '2026-09-21T12:00:00+00:00', 'A no servidor (novo)'), b: linhaServidor('b', {}, '2026-09-19T12:00:00+00:00', 'B no servidor (velho)') } });
        const env = makeEnv(cli, { constructive_report_templates: JSON.stringify([modeloLocal('a', '2026-09-20T09:00:00.000Z', 'A local (velho)'), modeloLocal('b', '2026-09-20T09:00:00.000Z', 'B local (novo)')]) });
        const r = await env.A.syncTemplates();
        const porId = {}; guardado(env).forEach(t => { porId[t.id] = t.nome; });
        eq('servidor mais novo substitui o local; local mais novo sobe', [r.baixados, r.enviados, porId.a, porId.b, cli.upserts.map(u => [u.id, u.nome])], [1, 1, 'A no servidor (novo)', 'B local (novo)', [['b', 'B local (novo)']]]);
        const igual = fakeClient({ rows: { a: linhaServidor('a', {}, '2026-09-20T09:00:00+00:00') } });
        const env3 = makeEnv(igual, { constructive_report_templates: JSON.stringify([modeloLocal('a', '2026-09-20T09:00:00.000Z')]) });
        const r3 = await env3.A.syncTemplates();
        eq('mesma data nos dois lados: nada a fazer', [r3.baixados, r3.enviados, igual.upserts.length], [0, 0, 0]);
    }

    // ---------------------------------------------------------------- sem login / sem tabela / sem cliente / uma vez só
    {
        const cli = fakeClient({ sessao: false });
        const env = makeEnv(cli, { constructive_report_templates: JSON.stringify([modeloLocal('l1')]) });
        const r = await env.A.syncTemplates();
        eq('sem login: não consulta nem envia nada', [r.ok, r.motivo, cli.selects, cli.upserts.length], [false, 'sem-sessao', 0, 0]);
        cli.sessao = true;
        const r2 = await env.A.syncTemplates();
        eq('depois do login, tenta de novo e funciona', [r2.ok, r2.enviados, cli.upserts.length], [true, 1, 1]);
        const r3 = await env.A.syncTemplates();
        eq('feita com sucesso, não repete na mesma página (uma consulta só)', [r3.ok, cli.selects], [true, 1]);
        const rf = await env.A.syncTemplates({ force: true });
        eq('force repete', [rf.ok, cli.selects], [true, 2]);
    }
    {
        const cli = fakeClient({ semTabela: true });
        const env = makeEnv(cli, { constructive_report_templates: JSON.stringify([modeloLocal('l1')]) });
        const r = await env.A.syncTemplates();
        eq('tabela inexistente: nada é enviado, circuito fechado e os modelos locais continuam valendo', [r.ok, r.motivo, cli.upserts.length, env.store.constructive_remote_templates_available, env.A.getReportTemplates('f1').length], [false, 'sem-tabela', 0, 'false', 1]);
        const env2 = makeEnv(null);
        eq('sem cliente do Supabase: não faz nada', (await env2.A.syncTemplates()).motivo, 'sem-cliente');
    }
    {
        const cli = fakeClient();
        const env = makeEnv(cli);
        const [a, b] = await Promise.all([env.A.syncTemplates(), env.A.syncTemplates()]);
        eq('duas chamadas ao mesmo tempo viram uma só', [cli.selects, a === b], [1, true]);
    }

    // ---------------------------------------------------------------- salvar no construtor: atalho_aba também vai para o servidor
    {
        const cli = fakeClient();
        const env = makeEnv(cli);
        await env.A.saveReportTemplate({ id: 'n1', form_id: 'f1', nome: 'Novo', tipo: 'individual', disponibilizar_no_mapa: true, atalho_aba: 'todas', config_pagina: { tamanho: 'A3' }, blocos: [] });
        eq('salvar um modelo grava o atalho_aba nos extras da linha do servidor', [cli.upserts.length, cli.upserts[0].config_pagina.tamanho, cli.upserts[0].config_pagina._extras.atalho_aba, 'updatedAt' in cli.upserts[0].config_pagina._extras], [1, 'A3', 'todas', false]);
    }

    console.log(`reportTemplatesSync: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
