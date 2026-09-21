// src/reportPreview.js
// PRÉVIA REAL DO RELATÓRIO NO CONSTRUTOR: monta os dados de uma feição FIXA DE TESTE (dados de exemplo para cada tipo
// de campo, uma geometria de 20 m x 30 m, vizinhos e uma rua) para abrir o relatório de verdade (relatorio_view.html)
// com o modelo que está sendo editado — sem depender de haver uma feição real no cadastro.
// Funções puras (sem DOM): testáveis em Node.

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ReportPreview = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const CENTRO = { lat: -7.0195, lng: -34.8326 }; // Cabedelo-PB
    const M_LAT = 111195;
    const M_LNG = M_LAT * Math.cos(CENTRO.lat * Math.PI / 180);
    const DATAS = ['2026-03-15', '2026-02-10', '2026-01-05', '2025-12-01'];

    const rectM = (x0m, y0m, x1m, y1m) => {
        const c = (xm, ym) => [CENTRO.lng + xm / M_LNG, CENTRO.lat + ym / M_LAT];
        return { type: 'Polygon', coordinates: [[c(x0m, y0m), c(x1m, y0m), c(x1m, y1m), c(x0m, y1m), c(x0m, y0m)]] };
    };

    /** Feição de teste: 20 m (leste-oeste) x 30 m (norte-sul) = 600 m². */
    function sampleGeometry() { return rectM(0, 0, 20, 30); }

    /** Camadas de exemplo ao redor: três lotes que dividem a divisa e uma rua ao sul (a 12 m). */
    function sampleLayers() {
        const lote = (n, nome, geom) => ({ type: 'Feature', properties: { r: 'Quadra A • Lote ' + n, t: nome, f: { nome: nome, lote: n } }, geometry: geom });
        return [
            {
                id: 'previa-lotes', name: 'Lotes (exemplo)', color: '#0284c7', kind: 'polygon', truncated: false,
                campos: [{ k: 'nome', l: 'Nome do proprietário' }, { k: 'lote', l: 'Lote' }],
                features: [lote('02', 'Maria Exemplo', rectM(20, 0, 35, 30)), lote('03', 'João Exemplo', rectM(0, 30, 20, 60)), lote('01', 'Ana Exemplo', rectM(-15, 0, 0, 30))]
            },
            {
                id: 'previa-ruas', name: 'Logradouros (exemplo)', color: '#f59e0b', kind: 'line', truncated: false,
                campos: [{ k: 'nome', l: 'Nome do logradouro' }],
                features: [{ type: 'Feature', properties: { r: 'Rua das Flores', t: 'Rua das Flores', f: { nome: 'Rua das Flores' } }, geometry: { type: 'LineString', coordinates: [[CENTRO.lng - 40 / M_LNG, CENTRO.lat - 12 / M_LAT], [CENTRO.lng + 60 / M_LNG, CENTRO.lat - 12 / M_LAT]] } }]
            }
        ];
    }

    const FOTO = (n) => ({ url: 'https://placehold.co/640x420/e2e8f0/475569?text=Foto+de+exemplo+' + n, name: 'foto_exemplo_' + n + '.jpg', title: 'Foto de exemplo ' + n });

    /** Valor de exemplo para um campo, conforme o tipo (o mesmo que o formatador do relatório entende). seq varia entre registros 1:N. */
    function sampleValue(field, seq) {
        seq = seq || 0;
        const tipo = String((field && field.type) || 'text').toLowerCase();
        const rotulo = (field && (field.label || field.name)) || 'Campo';
        switch (tipo) {
            case 'textarea': return 'Texto de exemplo com mais de uma frase, para testar quebras de linha e a largura do campo dentro do relatório. ' + rotulo + '.';
            case 'number': case 'integer': return 120 + seq * 15;
            case 'currency': return 15500.75 + seq * 1000;
            case 'area_m2': return 550.26 + seq * 20;
            case 'length_m': return 22.5 + seq;
            case 'volume_m3': return 84.3 + seq;
            case 'date': return DATAS[seq % DATAS.length];
            case 'current_date': return DATAS[0];
            case 'current_user': return 'Usuário de exemplo';
            case 'cpfcnpj': return seq % 2 ? '12345678000195' : '12345678909';
            case 'ipl': case 'ipf': return '08006534520264058200';
            case 'insc_imob_cabedelo': return '0120340560078';
            case 'pa_anpp_ap': return '1.24.000.000123/2026-45';
            case 'epol': case 'rip': return '2145.00192';
            case 'epol_1n': case 'rip_1n': return ['2145.00192', '2145.00193'];
            case 'cep': return '58310000';
            case 'checkbox': case 'boolean': return true;
            case 'hiperlink': return { title: 'Processo de exemplo', url: 'https://exemplo.gov.br/processo/' + (seq + 1), number: '000123' + seq + '-45.2026' };
            case 'hiperlink_1n': return [{ title: 'Processo A', url: 'https://exemplo.gov.br/a', number: '0001234-56.2026' }, { title: 'Processo B', url: 'https://exemplo.gov.br/b', number: '0007890-12.2026' }];
            case 'photo': return [FOTO(1 + seq * 2), FOTO(2 + seq * 2)];
            case 'attachment': return [{ url: 'https://exemplo.gov.br/anexo' + (seq + 1) + '.pdf', name: 'anexo_exemplo_' + (seq + 1) + '.pdf', title: 'Laudo de exemplo' }];
            case 'geolocation': return CENTRO.lat.toFixed(6) + ', ' + CENTRO.lng.toFixed(6);
            case 'select': case 'radio': {
                const op = Array.isArray(field.options) ? field.options : [];
                const escolhida = op.length ? op[seq % op.length] : null;
                return escolhida && typeof escolhida === 'object' ? (escolhida.label || escolhida.value || 'Opção de exemplo') : (escolhida || 'Opção de exemplo');
            }
            default: return 'Exemplo: ' + rotulo + (seq ? ' (' + (seq + 1) + ')' : '');
        }
    }

    const ehNativa = (t) => !!t && (t.isNative || t.tabType === 'orcamento_nativo' || t.id === 'orcamento_obra' || t.tabType === 'reports' || t.isReportsTab || t.tabType === 'consolidated' || t.isConsolidated);

    /** Dados da feição de teste: campos das abas simples e 2 registros em cada aba 1:N. */
    function sampleFeatureData(tabs) {
        const data = { id_banco: 'exemplo', _created_at: DATAS[0] };
        (tabs || []).forEach(tab => {
            if (!tab || ehNativa(tab) || !Array.isArray(tab.fields)) return;
            if (tab.isMultiple) {
                data[tab.id] = [0, 1].map(seq => {
                    const reg = { _created_at: DATAS[seq % DATAS.length] };
                    tab.fields.forEach(f => { if (f && f.id) reg[f.id] = sampleValue(f, seq); });
                    return reg;
                });
            } else {
                tab.fields.forEach(f => { if (f && f.id) data[f.id] = sampleValue(f, 0); });
            }
        });
        return data;
    }

    /** formFields (com aba) a partir das abas, no mesmo formato que a página do mapa envia. */
    function fieldsFromTabs(tabs) {
        const out = [];
        (tabs || []).forEach(t => (t && Array.isArray(t.fields) ? t.fields : []).forEach(f => out.push(Object.assign({}, f, { tabId: t.id, tabTitle: t.title || 'Aba Geral', isMultiple: !!t.isMultiple }))));
        return out;
    }

    /**
     * Dados para abrir o relatório real com a feição de teste.
     * opts: { template (o modelo em edição), formId, formTabs }.
     */
    function buildPreviewPayload(opts) {
        opts = opts || {};
        const tabs = Array.isArray(opts.formTabs) ? opts.formTabs : [];
        const tpl = opts.template || null;
        const temMapa = !!(tpl && Array.isArray(tpl.blocos) && tpl.blocos.some(b => b.tipo === 'mapa_estatico'));
        return {
            templateId: tpl && tpl.id,
            template: tpl,
            formId: opts.formId || (tpl && tpl.form_id) || null,
            formFields: fieldsFromTabs(tabs),
            formTabs: tabs,
            featureData: sampleFeatureData(tabs),
            featureGeometry: sampleGeometry(),
            featureKey: 'exemplo-previa',
            camadasMapa: temMapa ? sampleLayers() : [],
            ortofotos: [],
            preview: true, // o relatório avisa que é prévia e não salva ajustes nem registra emissões
            timestamp: Date.now()
        };
    }

    return { CENTRO, sampleGeometry, sampleLayers, sampleValue, sampleFeatureData, fieldsFromTabs, buildPreviewPayload };
});
