// tests/layerFilter.test.js
// Filtro profissional de feições (E dentro do grupo, OU entre grupos). Rodar com: node tests/layerFilter.test.js

const LF = require('../src/layerFilter.js');

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }
function eq(name, a, e) { total++; if (JSON.stringify(a) === JSON.stringify(e)) return; failed++; console.error(`  FALHOU: ${name}\n     esperado: ${JSON.stringify(e)}\n     obtido:   ${JSON.stringify(a)}`); }

// ---------------------------------------------------------------- tipo do campo e operadores
eq('tipo por campo: número, data, lista e texto', [LF.tipoDoCampo({ type: 'area_m2' }), LF.tipoDoCampo({ type: 'date' }), LF.tipoDoCampo({ type: 'select' }), LF.tipoDoCampo({ type: 'text' }), LF.tipoDoCampo(null)], ['numero', 'data', 'lista', 'texto', 'texto']);
eq('operadores do texto', LF.operadoresValidos('texto'), ['igual', 'contem', 'comeca_com', 'diferente', 'vazio', 'preenchido']);
eq('operadores do número (com "entre")', LF.operadoresValidos('numero'), ['igual', 'diferente', 'maior', 'menor', 'entre', 'vazio', 'preenchido']);
eq('operadores da lista (sem contém/começa com/entre)', LF.operadoresValidos('lista'), ['igual', 'diferente', 'vazio', 'preenchido']);
eq('rótulo do operador', [LF.rotuloOperador('igual'), LF.rotuloOperador('entre'), LF.rotuloOperador('xyz')], ['é igual a', 'entre', 'xyz']);

// ---------------------------------------------------------------- normalização
eq('normalizeCondicao: aceita nomes em pt (campo/operador/valor) e em inglês (field/op/value)', [LF.normalizeCondicao({ campo: 'a', operador: 'igual', valor: '1' }), LF.normalizeCondicao({ field: 'a', op: 'igual', value: '1' })], [{ field: 'a', op: 'igual', value: '1', value2: '' }, { field: 'a', op: 'igual', value: '1', value2: '' }]);
eq('normalizeCondicao: padrão é "contem" e sem campo vira string vazia', LF.normalizeCondicao({}), { field: '', op: 'contem', value: '', value2: '' });
eq('normalizeGrupo: descarta condições sem campo e limita a 10', LF.normalizeGrupo({ condicoes: [{ field: 'a' }, {}, { field: 'b' }] }).condicoes.map(c => c.field), ['a', 'b']);
ok('normalizeGrupo: limita a MAX_CONDICOES condições', LF.normalizeGrupo({ condicoes: Array.from({ length: 20 }, (_, i) => ({ field: 'c' + i })) }).condicoes.length === LF.MAX_CONDICOES);
eq('normalizeFiltro: aceita { grupos }, uma lista solta (vira 1 grupo) e descarta grupos vazios', [
    LF.normalizeFiltro({ grupos: [{ condicoes: [{ field: 'a' }] }, { condicoes: [] }] }).grupos.length,
    LF.normalizeFiltro([{ field: 'a' }, { field: 'b' }]).grupos.length,
    LF.normalizeFiltro(null).grupos.length,
    LF.normalizeFiltro({}).grupos.length
], [1, 1, 0, 0]);
ok('normalizeFiltro: limita a MAX_GRUPOS grupos', LF.normalizeFiltro({ grupos: Array.from({ length: 20 }, (_, i) => ({ condicoes: [{ field: 'c' + i }] })) }).grupos.length === LF.MAX_GRUPOS);
eq('filtroVazio', [LF.filtroVazio(null), LF.filtroVazio({ grupos: [] }), LF.filtroVazio(LF.normalizeFiltro({ grupos: [{ condicoes: [{ field: 'a' }] }] }))], [true, true, false]);

// ---------------------------------------------------------------- avaliarCondicao — texto
{
    const cond = (op, value, value2) => ({ field: 'nome', op, value, value2 });
    ok('igual (sem acento/maiúsculas)', LF.avaliarCondicao('João Ferreira', cond('igual', 'joao ferreira')));
    ok('diferente', LF.avaliarCondicao('Maria', cond('diferente', 'joao')));
    ok('contém', LF.avaliarCondicao('Rua das Flores', cond('contem', 'flores')));
    ok('não contém', !LF.avaliarCondicao('Rua das Flores', cond('contem', 'palmeiras')));
    ok('começa com', LF.avaliarCondicao('Rua das Flores', cond('comeca_com', 'rua')));
    ok('não começa com', !LF.avaliarCondicao('Rua das Flores', cond('comeca_com', 'flores')));
    ok('vazio: string vazia, undefined e null contam como vazio', LF.avaliarCondicao('', cond('vazio')) && LF.avaliarCondicao(undefined, cond('vazio')) && LF.avaliarCondicao(null, cond('vazio')));
    ok('preenchido: não vazio', LF.avaliarCondicao('x', cond('preenchido')) && !LF.avaliarCondicao('', cond('preenchido')));
}

// ---------------------------------------------------------------- avaliarCondicao — número
{
    const campo = { type: 'area_m2' };
    const cond = (op, value, value2) => ({ field: 'area', op, value, value2 });
    ok('igual (aceita vírgula BR)', LF.avaliarCondicao('1.234,56', cond('igual', '1234,56'), campo));
    ok('diferente', LF.avaliarCondicao(500, cond('diferente', 300), campo));
    ok('maior', LF.avaliarCondicao(500, cond('maior', 300), campo));
    ok('não maior (igual não conta)', !LF.avaliarCondicao(300, cond('maior', 300), campo));
    ok('menor', LF.avaliarCondicao(200, cond('menor', 300), campo));
    ok('entre (inclusive nas pontas, ordem do usuário não importa)', LF.avaliarCondicao(300, cond('entre', 300, 500), campo) && LF.avaliarCondicao(400, cond('entre', 500, 300), campo));
    ok('fora do intervalo', !LF.avaliarCondicao(600, cond('entre', 300, 500), campo));
    ok('valor não numérico: não casa com nada além de vazio/preenchido', !LF.avaliarCondicao('abc', cond('igual', '1'), campo));
}

// ---------------------------------------------------------------- avaliarCondicao — data
{
    const campo = { type: 'date' };
    const cond = (op, value, value2) => ({ field: 'data', op, value, value2 });
    ok('igual (mesma data)', LF.avaliarCondicao('2026-03-15', cond('igual', '2026-03-15'), campo));
    ok('maior (mais recente)', LF.avaliarCondicao('2026-03-15', cond('maior', '2026-01-01'), campo));
    ok('menor (mais antiga)', LF.avaliarCondicao('2026-01-01', cond('menor', '2026-03-15'), campo));
    ok('entre duas datas', LF.avaliarCondicao('2026-02-10', cond('entre', '2026-01-01', '2026-03-15'), campo));
    ok('fora do período', !LF.avaliarCondicao('2026-06-01', cond('entre', '2026-01-01', '2026-03-15'), campo));
    ok('data inválida não casa', !LF.avaliarCondicao('não é data', cond('igual', '2026-01-01'), campo));
}

// ---------------------------------------------------------------- avaliarCondicao — lista (select)
{
    const campo = { type: 'select', options: ['Regular', 'Irregular'] };
    ok('lista: igual', LF.avaliarCondicao('Irregular', { field: 'sit', op: 'igual', value: 'irregular' }, campo));
    ok('lista: diferente', LF.avaliarCondicao('Regular', { field: 'sit', op: 'diferente', value: 'irregular' }, campo));
}

// ---------------------------------------------------------------- avaliarFeature: E dentro do grupo, OU entre grupos
{
    const fieldIndex = { recuou: { type: 'select' }, fase: { type: 'select' }, situacao: { type: 'select' } };
    // (Recuou = Sim E Fase = Arquivado) OU (Situação = Irregular)  — exemplo do pedido original
    const filtro = LF.normalizeFiltro({
        grupos: [
            { condicoes: [{ field: 'recuou', op: 'igual', value: 'sim' }, { field: 'fase', op: 'igual', value: 'arquivado' }] },
            { condicoes: [{ field: 'situacao', op: 'igual', value: 'irregular' }] }
        ]
    });
    ok('casa pelo 1º grupo (as duas condições E)', LF.avaliarFeature({ recuou: 'Sim', fase: 'Arquivado', situacao: 'Regular' }, filtro, fieldIndex));
    ok('não casa: só uma das condições do 1º grupo, e o 2º grupo também não bate', !LF.avaliarFeature({ recuou: 'Sim', fase: 'Em andamento', situacao: 'Regular' }, filtro, fieldIndex));
    ok('casa pelo 2º grupo (OU), mesmo sem o 1º', LF.avaliarFeature({ recuou: 'Não', fase: 'Em andamento', situacao: 'Irregular' }, filtro, fieldIndex));
    ok('casa pelos dois grupos ao mesmo tempo', LF.avaliarFeature({ recuou: 'Sim', fase: 'Arquivado', situacao: 'Irregular' }, filtro, fieldIndex));
    ok('não casa por nenhum', !LF.avaliarFeature({ recuou: 'Não', fase: 'Em andamento', situacao: 'Regular' }, filtro, fieldIndex));
    ok('filtro vazio: casa com tudo (não restringe)', LF.avaliarFeature({ qualquer: 'coisa' }, LF.normalizeFiltro(null)) && LF.avaliarFeature({}, LF.normalizeFiltro({ grupos: [] })));
    ok('feição sem properties (undefined) não quebra', LF.avaliarFeature(undefined, filtro, fieldIndex) === false);
}

// ---------------------------------------------------------------- filtrarFeatures
{
    const features = [
        { properties: { sit: 'Regular', area: 500 } },
        { properties: { sit: 'Irregular', area: 300 } },
        { properties: { sit: 'Irregular', area: 900 } },
        { properties: {} }
    ];
    const fieldIndex = { sit: { type: 'select' }, area: { type: 'area_m2' } };
    const filtro = LF.normalizeFiltro({ grupos: [{ condicoes: [{ field: 'sit', op: 'igual', value: 'irregular' }, { field: 'area', op: 'maior', value: '400' }] }] });
    eq('só a feição Irregular com área > 400', LF.filtrarFeatures(features, filtro, fieldIndex).map(f => f.properties.area), [900]);
    eq('sem filtro (vazio): devolve todas', LF.filtrarFeatures(features, LF.normalizeFiltro(null)).length, 4);
    eq('lista vazia de feições: não quebra', LF.filtrarFeatures(null, filtro, fieldIndex), []);
}

// ---------------------------------------------------------------- valoresDistintos (para o seletor de valor da lista)
{
    const features = [
        { properties: { sit: 'Regular' } }, { properties: { sit: 'Irregular' } }, { properties: { sit: 'Regular' } }, { properties: { sit: '' } }, { properties: {} }
    ];
    eq('valores distintos, sem repetir e sem os vazios', LF.valoresDistintos(features, 'sit'), ['Irregular', 'Regular']);
    // com a definição do campo: o valor bruto passa pelo formatador do tipo (aqui, m²), como no resto do relatório
    const campoArea = { id: 'area', label: 'Área', type: 'area_m2' };
    eq('com a definição do campo: usa a mesma formatação do tipo (m²)', LF.valoresDistintos([{ properties: { area: 500 } }, { properties: { area: 300 } }], 'area', campoArea), ['300,00 m²', '500,00 m²']);
    ok('limite de itens é respeitado', LF.valoresDistintos([{ properties: { x: 'a' } }, { properties: { x: 'b' } }, { properties: { x: 'c' } }], 'x', null, 2).length === 2);
}

// ---------------------------------------------------------------- descreverFiltro (legenda do relatório)
{
    const fieldIndex = { recuou: { label: 'Recuou' }, fase: { label: 'Fase da Investigação' }, situacao: { label: 'Situação' } };
    const filtro = LF.normalizeFiltro({
        grupos: [
            { condicoes: [{ field: 'recuou', op: 'igual', value: 'Sim' }, { field: 'fase', op: 'igual', value: 'Arquivado' }] },
            { condicoes: [{ field: 'situacao', op: 'igual', value: 'Irregular' }] }
        ]
    });
    eq('descreve com parênteses no grupo de mais de uma condição', LF.descreverFiltro(filtro, fieldIndex), '(Recuou é igual a Sim E Fase da Investigação é igual a Arquivado) OU Situação é igual a Irregular');
    eq('campo sem rótulo cai no próprio id', LF.descreverFiltro(LF.normalizeFiltro({ grupos: [{ condicoes: [{ field: 'xyz', op: 'preenchido' }] }] }), {}), 'xyz está preenchido');
    eq('entre mostra os dois valores', LF.descreverFiltro(LF.normalizeFiltro({ grupos: [{ condicoes: [{ field: 'area', op: 'entre', value: '100', value2: '500' }] }] }), {}), 'area entre 100 e 500');
    eq('filtro vazio: descrição vazia', LF.descreverFiltro(LF.normalizeFiltro(null), {}), '');
}

console.log(`layerFilter: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
