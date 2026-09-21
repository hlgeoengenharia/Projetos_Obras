// tests/viewerGrid.test.js
// Executa a Grade de Atributos / Campos REAL do visualizador (extraída de relatorio_view.html).
// Foco: fotos e anexos em "Lista" (título + arquivo) ou "Imagem na íntegra", por campo.
// Rodar com: node tests/viewerGrid.test.js

const fs = require('fs');
const path = require('path');
const FieldFormatter = require('../src/fieldFormatter.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'relatorio_view.html'), 'utf8');
const lines = html.split(/\r?\n/);

function extractFunction(name) {
    const start = lines.findIndex(l => l.startsWith(`        function ${name}(`));
    if (start < 0) throw new Error(`função ${name} não encontrada`);
    let end = start;
    while (lines[end] !== '        }') end++;
    return lines.slice(start, end + 1).join('\n');
}

const reportPayload = { featureGeometry: null };
// eslint-disable-next-line no-new-func
// os desenhistas moram em src/reportBlocks.js (o visualizador só os liga à página)
const ReportBlocks = require('../src/reportBlocks.js');
const load = new Function('FieldFormatter', 'reportPayload', 'turf', 'ReportBlocks', `
    ${extractFunction('escapeHtml')}
    const B = ReportBlocks.create({ esc: escapeHtml, FieldFormatter: FieldFormatter, geometryCenter: () => null });
    return { renderAttributeGrid: B.renderAttributeGrid };
`);
const { renderAttributeGrid } = load(FieldFormatter, reportPayload, undefined, ReportBlocks);

let total = 0;
let failed = 0;
function ok(name, cond) { total++; if (cond) return; failed++; console.error(`  FALHOU: ${name}`); }

// ---------------------------------------------------------------- dados de exemplo
const fields = [
    { id: 'f_prop', label: 'Proprietário', type: 'text' },
    { id: 'f_anx', label: 'Anexos', type: 'attachment' },
    { id: 'f_fotos', label: 'Fotos do imóvel', type: 'photo' },
    { id: 'f_links', label: 'Processos', type: 'hiperlink_1n' }
];
const featureData = {
    f_prop: 'Maria da Silva',
    f_anx: JSON.stringify([
        { name: 'logo_MPF.jpg', url: 'https://x/logo_MPF.jpg', title: 'MPF', uploadedBy: 'Joana Araujo', uploadedAt: '2026-08-14T15:00:00Z' },
        { name: 'oficio.pdf', url: 'https://x/oficio.pdf', title: 'Ofício' }
    ]),
    f_fotos: JSON.stringify([{ name: 'fachada.jpg', url: 'https://x/fachada.jpg', title: 'Fachada' }]),
    f_links: JSON.stringify([{ title: 'Inquérito Civil', number: '1.24.000/2026', url: 'mpf.mp.br/ic' }])
};
const base = { colunasLayout: 2, campos_selecionados: fields.map(f => ({ id: f.id, label: f.label })) };

// ---------------------------------------------------------------- padrão: anexo em lista (como no print), foto em imagem
let out = renderAttributeGrid(Object.assign({}, base), featureData, fields);
ok('anexo (padrão) em lista: título e nome do arquivo', out.includes('<strong>MPF</strong>') && out.includes('logo_MPF.jpg'));
ok('anexo (padrão) NÃO mostra a imagem', !out.includes('src="https://x/logo_MPF.jpg"'));
ok('foto (padrão) mostra a imagem', out.includes('src="https://x/fachada.jpg"'));
ok('texto simples continua simples', out.includes('Maria da Silva'));
ok('campo 1:N de link na íntegra (título, número e endereço)',
    out.includes('Inquérito Civil') && out.includes('1.24.000/2026') && out.includes('>mpf.mp.br/ic</a>'));
ok('campos ricos não são truncados', out.includes('break-words whitespace-normal'));

// ---------------------------------------------------------------- escolha do usuário: anexo como IMAGEM na íntegra
out = renderAttributeGrid(Object.assign({}, base, { campos_exibicao: { f_anx: 'imagem' } }), featureData, fields);
ok('anexo em modo imagem mostra a imagem', out.includes('src="https://x/logo_MPF.jpg"'));
ok('imagem vem com título e metadados', out.includes('>MPF</div>') && out.includes('Enviado por: Joana Araujo') && /\d{2}\/\d{2}\/2026/.test(out));
ok('PDF do mesmo campo continua em lista', !out.includes('src="https://x/oficio.pdf"') && out.includes('Ofício'));

// ---------------------------------------------------------------- escolha do usuário: foto como LISTA
out = renderAttributeGrid(Object.assign({}, base, { campos_exibicao: { f_fotos: 'lista' } }), featureData, fields);
ok('foto em modo lista: sem imagem', !out.includes('src="https://x/fachada.jpg"'));
ok('foto em modo lista: título e nome do arquivo', out.includes('<strong>Fachada</strong>') && out.includes('fachada.jpg'));

// a escolha vale por CAMPO: mexer em um não altera o outro
out = renderAttributeGrid(Object.assign({}, base, { campos_exibicao: { f_anx: 'imagem', f_fotos: 'lista' } }), featureData, fields);
ok('escolha independente por campo', out.includes('src="https://x/logo_MPF.jpg"') && !out.includes('src="https://x/fachada.jpg"'));

// ---------------------------------------------------------------- lista corrida (1 coluna) respeita a mesma escolha
out = renderAttributeGrid(Object.assign({}, base, { colunasLayout: 1, campos_exibicao: { f_anx: 'imagem' } }), featureData, fields);
ok('1 coluna: anexo em modo imagem', out.includes('src="https://x/logo_MPF.jpg"'));
ok('1 coluna: foto no padrão (imagem)', out.includes('src="https://x/fachada.jpg"'));
ok('1 coluna: campo de link na íntegra', out.includes('>mpf.mp.br/ic</a>'));

// ---------------------------------------------------------------- segurança
const evilData = Object.assign({}, featureData, { f_anx: JSON.stringify([{ name: 'a.jpg', url: 'javascript:alert(1)', title: '<img onerror=x>' }]) });
out = renderAttributeGrid(Object.assign({}, base, { campos_exibicao: { f_anx: 'imagem' } }), evilData, fields);
ok('URL javascript: nunca vira imagem nem link', !out.includes('javascript:'));
ok('título com HTML é escapado', !out.includes('<img onerror') && out.includes('&lt;img onerror=x&gt;'));

console.log(`viewerGrid: ${total - failed}/${total} verificações passaram`);
if (failed > 0) {
    console.error(`${failed} falha(s)`);
    process.exit(1);
}
