// Testes de regressão e garantia de qualidade para EventsEngine
const fs = require('fs');
const path = require('path');

// Mock DOM / Browser Environment
global.window = {};
global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
};
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; }
};

// Carregar o código de eventsEngine.js
const eventsEngineCode = fs.readFileSync(path.join(__dirname, 'src', 'eventsEngine.js'), 'utf-8');
eval(eventsEngineCode);

const EventsEngine = global.window.EventsEngine;
if (!EventsEngine) {
    console.error("❌ ERRO: EventsEngine não foi exportado no escopo global.");
    process.exit(1);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

console.log("=== INICIANDO TESTES DO MOTOR DE EVENTOS & ALERTAS (EventsEngine) ===");

// 1. Teste de Periodicidade (Manutenção Semestral de Logradouros)
(() => {
    console.log("\n[Cenário 1] Monitoramento de Periodicidade (Última manutenção há 6 meses)");
    
    // Data de 7 meses atrás (já estourou os 6 meses)
    const d7MesesAtras = new Date();
    d7MesesAtras.setMonth(d7MesesAtras.getMonth() - 7);
    const dataIso = d7MesesAtras.toISOString().split('T')[0];

    const rule = {
        id: "trig_manutencao",
        nome: "Manutenção Semestral",
        tipo: "periodicidade",
        campo_data: "dt_manutencao",
        intervalo_valor: 6,
        intervalo_unidade: "meses",
        aviso_previo_dias: 15,
        severidade: "critico",
        mensagem: "Logradouro {nome} completou 6 meses sem manutenção."
    };

    const forms = [{
        id: "form_logradouros",
        eventTriggers: [rule]
    }];

    const themes = [{
        id: "theme_logradouros",
        name: "Logradouros",
        formId: "form_logradouros",
        features: [
            {
                properties: {
                    _tempId: "feat_rua_a",
                    nome: "Avenida Central",
                    dt_manutencao: dataIso
                },
                geometry: { type: "Point", coordinates: [-35.0, -8.0] }
            }
        ]
    }];

    const alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_1" });
    assert(alerts.length === 1, "Detectou alerta de periodicidade vencida");
    assert(alerts[0].severidade === 'critico', "Severidade identificada como 'critico'");
    assert(alerts[0].mensagemFormatada === "Logradouro Avenida Central completou 6 meses sem manutenção.", "Mensagem interpolou variável {nome} com perfeição");
    assert(alerts[0].status === 'vencido', "Status do alerta classificado como 'vencido'");
})();

// 2. Teste de Validade de Alvará/Habite-se (Vencimento próximo e vencido)
(() => {
    console.log("\n[Cenário 2] Monitoramento de Validade de Alvarás / Habite-se com Aviso Prévio");
    
    // Alvará que vence em 10 dias (aviso prévio de 15 dias -> deve disparar com severidade 'atencao')
    const d10DiasFrente = new Date();
    d10DiasFrente.setDate(d10DiasFrente.getDate() + 10);
    const dataVenc = d10DiasFrente.toISOString().split('T')[0];

    const rule = {
        id: "trig_alvara",
        nome: "Vencimento de Alvará",
        tipo: "validade",
        campo_data: "dt_validade",
        aviso_previo_dias: 15,
        severidade: "atencao",
        mensagem: "Alvará da obra {numero_processo} está próximo do vencimento."
    };

    const forms = [{
        id: "form_alvaras",
        eventTriggers: [rule]
    }];

    const themes = [{
        id: "theme_alvaras",
        name: "Alvarás Emitidos",
        formId: "form_alvaras",
        features: [
            {
                properties: {
                    _tempId: "feat_obra_102",
                    numero_processo: "PROC-2026/099",
                    dt_validade: dataVenc
                },
                geometry: { type: "Point", coordinates: [-35.2, -8.1] }
            }
        ]
    }];

    const alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_fiscal" });
    assert(alerts.length === 1, "Detectou alerta preventivo dentro da janela de aviso prévio");
    assert(alerts[0].status === 'proximo', "Status identificado como 'proximo'");
    assert(alerts[0].mensagemFormatada.includes("PROC-2026/099"), "Identificou o número do processo na mensagem");
})();

// 3. Teste de Validade Calculada (Data de Emissão + Prazo em Meses)
(() => {
    console.log("\n[Cenário 3] Validade Calculada (Data de Emissão + Campo Prazo em Meses)");

    // Emitido há 14 meses com prazo de 12 meses -> vencido há 2 meses
    const d14MesesAtras = new Date();
    d14MesesAtras.setMonth(d14MesesAtras.getMonth() - 14);
    const dataEmissao = d14MesesAtras.toISOString().split('T')[0];

    const rule = {
        id: "trig_certidao",
        nome: "Certidão Vencida",
        tipo: "calculado",
        campo_data: "dt_emissao",
        campo_prazo_valor: "prazo_validade_meses",
        prazo_unidade: "meses",
        aviso_previo_dias: 30,
        severidade: "critico",
        mensagem: "Certidão {tipo_doc} nº {numero} está vencida."
    };

    const forms = [{
        id: "form_certidoes",
        eventTriggers: [rule]
    }];

    const themes = [{
        id: "theme_certidoes",
        name: "Certidões",
        formId: "form_certidoes",
        features: [
            {
                properties: {
                    _tempId: "feat_cert_1",
                    tipo_doc: "Habite-se",
                    numero: "5421/2025",
                    dt_emissao: dataEmissao,
                    prazo_validade_meses: 12
                },
                geometry: { type: "Point", coordinates: [-35.1, -8.2] }
            }
        ]
    }];

    const alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_adm" });
    assert(alerts.length === 1, "Detectou alerta com validade calculada dinamicamente");
    assert(alerts[0].status === 'vencido', "Status da certidão é 'vencido'");
    assert(alerts[0].mensagemFormatada === "Certidão Habite-se nº 5421/2025 está vencida.", "Mensagem formatada com as variáveis corretas");
})();

// 4. Teste de Filtro de Condição (Ex: Não alertar se Status == 'Concluído')
(() => {
    console.log("\n[Cenário 4] Filtro Condicional (Ignorar feições já concluídas)");

    const dVencida = new Date();
    dVencida.setMonth(dVencida.getMonth() - 3);

    const rule = {
        id: "trig_filtro",
        nome: "Obras Atrasadas",
        tipo: "validade",
        campo_data: "dt_fim_previsto",
        campo_filtro: "status_obra",
        filtro_operador: "!=",
        filtro_valor: "Concluído",
        severidade: "critico"
    };

    const forms = [{ id: "f1", eventTriggers: [rule] }];
    const themes = [{
        id: "t1",
        formId: "f1",
        features: [
            {
                properties: { _tempId: "f_concluida", dt_fim_previsto: dVencida.toISOString().split('T')[0], status_obra: "Concluído" }
            },
            {
                properties: { _tempId: "f_em_andamento", dt_fim_previsto: dVencida.toISOString().split('T')[0], status_obra: "Em Andamento" }
            }
        ]
    }];

    const alerts = EventsEngine.evaluateAlerts(themes, forms, {});
    assert(alerts.length === 1, "Filtrou corretamente a obra 'Concluído' e manteve 'Em Andamento'");
    assert(alerts[0].featureId === "f_em_andamento", "Feição pendente correta selecionada");
})();

// 5. Teste de Ações de Ciclo de Vida: Dar Ciente e Adiar
(() => {
    console.log("\n[Cenário 5] Ciclo de Vida do Alerta: Dar Ciente e Adiar");

    const rule = {
        id: "trig_life",
        nome: "Alerta Geral",
        tipo: "validade",
        campo_data: "dt_limite",
        severidade: "info"
    };
    const forms = [{ id: "f_life", eventTriggers: [rule] }];
    const dPassada = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const themes = [{
        id: "t_life",
        formId: "f_life",
        features: [{ properties: { _tempId: "feat_life_1", dt_limite: dPassada } }]
    }];

    let alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_test" });
    assert(alerts.length === 1, "Alerta inicialmente ativo");
    const alertId = alerts[0].id;

    // Dar ciente
    EventsEngine.markAsAcknowledged(alertId);
    alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_test" });
    assert(alerts.length === 0, "Alerta suprimido após 'Dar Ciente'");

    // Reset para testar Snooze
    localStorage.removeItem('geogestor_alertas_cientes');
    EventsEngine.snoozeAlert(alertId, 7);
    alerts = EventsEngine.evaluateAlerts(themes, forms, { id: "user_test" });
    assert(alerts.length === 0, "Alerta suprimido após 'Adiar por 7 dias'");
})();

console.log(`\n=================================================`);
console.log(`RESULTADO FINAL: ${passed} PASSOU | ${failed} FALHOU`);
console.log(`=================================================`);

if (failed > 0) {
    process.exit(1);
}
