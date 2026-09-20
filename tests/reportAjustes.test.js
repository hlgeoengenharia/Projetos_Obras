// tests/reportAjustes.test.js
// Ajustes do usuário no relatório gerado (por modelo + feição): servidor (Supabase) com reserva no navegador.
// Rodar com: node tests/reportAjustes.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let total = 0;
let failed = 0;
function ok(name, c) { total++; if (c) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

function makeEnv(supabaseClient) {
    const store = {};
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
    const window = { localStorage };
    window.window = window;
    const ctx = { window, localStorage, console: { log() {}, info() {}, warn() {}, error() {} } };
    if (supabaseClient) ctx.supabaseClient = supabaseClient;
    ctx.self = window;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'reportAdapter.js'), 'utf8'), ctx);
    return { A: window.ReportAdapter, store };
}

// Supabase simulado: guarda linhas por (template, feição); pode simular tabela inexistente
function fakeClient(opts) {
    opts = opts || {};
    const rows = {};
    const calls = { upsert: 0, select: 0, args: null };
    return {
        rows, calls,
        from(table) {
            if (table !== 'relatorios_ajustes') throw new Error('tabela inesperada ' + table);
            return {
                select() {
                    const q = { f: {} };
                    const api = {
                        eq(c, v) { q.f[c] = v; return api; },
                        async maybeSingle() {
                            calls.select++;
                            if (opts.missing) return { data: null, error: { code: 'PGRST205', message: 'not found' } };
                            const r = rows[q.f.template_id + '|' + q.f.feature_key];
                            return { data: r ? { ajustes: r.ajustes } : null, error: null };
                        }
                    };
                    return api;
                },
                async upsert(row, o) {
                    calls.upsert++; calls.args = { row, o };
                    if (opts.missing) return { error: { code: '42P01', message: 'relation does not exist' } };
                    if (opts.fail) return { error: { code: '500', message: 'boom' } };
                    rows[row.template_id + '|' + row.feature_key] = row;
                    return { error: null };
                }
            };
        }
    };
}

(async () => {
    // ---------------------------------------------------------------- com servidor
    const cli = fakeClient();
    let { A, store } = makeEnv(cli);
    let r = await A.saveAjustes('rpt1', '10', 'form1', { norte: false, camadasLigadas: ['1'] });
    eq('salva no servidor', [r.ok, r.remoto], [true, true]);
    eq('upsert por modelo + feição + usuário', cli.calls.args.o, { onConflict: 'template_id,feature_key,user_id' });
    eq('linha enviada', [cli.calls.args.row.template_id, cli.calls.args.row.feature_key, cli.calls.args.row.form_id], ['rpt1', '10', 'form1']);
    ok('não envia user_id (o banco preenche com auth.uid())', !('user_id' in cli.calls.args.row));
    ok('também guarda uma cópia no navegador', /rpt1\|10/.test(store['constructive_report_ajustes']));
    eq('lê do servidor', await A.getAjustes('rpt1', '10'), { norte: false, camadasLigadas: ['1'] });
    eq('outra feição não herda ajustes', await A.getAjustes('rpt1', '11'), null);
    eq('outro modelo não herda ajustes', await A.getAjustes('rpt2', '10'), null);

    // ---------------------------------------------------------------- tabela ainda não criada: cai para o navegador e não insiste
    const miss = fakeClient({ missing: true });
    ({ A, store } = makeEnv(miss));
    r = await A.saveAjustes('rpt1', '10', 'form1', { baseMap: 'satelite' });
    eq('sem tabela: salva só no navegador', [r.ok, r.remoto], [true, false]);
    eq('sem tabela: leitura vem do navegador', await A.getAjustes('rpt1', '10'), { baseMap: 'satelite' });
    ok('circuito fechado: não guarda "disponível"', store['constructive_report_ajustes_remote'] === 'false');
    const antes = miss.calls.upsert + miss.calls.select;
    await A.saveAjustes('rpt1', '10', 'form1', { baseMap: 'osm' });
    await A.getAjustes('rpt1', '10');
    eq('circuito fechado: não faz mais chamadas ao servidor', miss.calls.upsert + miss.calls.select, antes);

    // ---------------------------------------------------------------- erro passageiro do servidor: navegador, mas volta a tentar
    const flaky = fakeClient({ fail: true });
    ({ A } = makeEnv(flaky));
    r = await A.saveAjustes('rpt1', '10', 'form1', { escala: false });
    eq('erro do servidor: guarda no navegador', [r.ok, r.remoto], [true, false]);
    r = await A.saveAjustes('rpt1', '10', 'form1', { escala: true });
    ok('erro passageiro não fecha o circuito (tenta de novo)', flaky.calls.upsert === 2);

    // ---------------------------------------------------------------- sem cliente Supabase
    ({ A } = makeEnv(null));
    r = await A.saveAjustes('rpt1', '10', 'form1', { projecao: false });
    eq('sem Supabase: navegador', [r.ok, r.remoto], [true, false]);
    eq('sem Supabase: lê do navegador', await A.getAjustes('rpt1', '10'), { projecao: false });
    eq('chave vazia não salva nem lê', [(await A.saveAjustes('rpt1', '', 'f', {})).ok, await A.getAjustes('', '10')], [false, null]);

    console.log(`reportAjustes: ${total - failed}/${total} verificações passaram`);
    if (failed > 0) {
        console.error(`${failed} falha(s)`);
        process.exit(1);
    }
})();
