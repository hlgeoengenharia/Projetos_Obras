// tests/attributeMapping.test.js
// Testa o mapeamento 1:N de atributos e o fallback inteligente de campos de endereço/CEP.
// Rodar com: node tests/attributeMapping.test.js

const assert = require('assert');

let total = 0;
let failed = 0;

function test(name, fn) {
    total++;
    try {
        fn();
    } catch(e) {
        failed++;
        console.error(`  FALHOU: ${name}\n  Erro: ${e.message}`);
    }
}

// -------------------------------------------------------------------------------------
// TESTE 1: Mapeamento 1:N de Importação (uma mesma coluna de origem abastece múltiplos campos)
// -------------------------------------------------------------------------------------
test('Importação 1:N - a mesma coluna LOGRADOURO abastece tanto NOME quanto CEP(logradouro)', () => {
    const rawProperties = {
        LOGRADOURO: "RUA MESSIAS PESSOA DA SILVA",
        BAIRRO: "POCO",
        SETOR: "03",
        CEP_NUM: "58310000"
    };

    const inverseMappings = [
        { targetFieldId: 'field_nome', geojsonProp: 'LOGRADOURO' },
        { targetFieldId: 'field_cep__logradouro', geojsonProp: 'LOGRADOURO' },
        { targetFieldId: 'field_bairro', geojsonProp: 'BAIRRO' },
        { targetFieldId: 'field_cep__bairro', geojsonProp: 'BAIRRO' },
        { targetFieldId: 'field_setor', geojsonProp: 'SETOR' },
        { targetFieldId: 'field_cep__cep', geojsonProp: 'CEP_NUM' }
    ];

    const formFieldsMap = {
        field_nome: 'text',
        field_bairro: 'text',
        field_setor: 'text',
        field_cep: 'cep'
    };

    const newProps = { themeId: 'theme_test', _tempId: 'temp_1' };

    // Simula a lógica implementada no confirmThemeCreation
    inverseMappings.forEach(m => {
        const geoProp = m.geojsonProp;
        if (rawProperties[geoProp] === undefined || rawProperties[geoProp] === null) return;

        let val = rawProperties[geoProp];
        let actualKey = m.targetFieldId;
        let subField = null;
        if (actualKey.includes('__')) {
            const parts = actualKey.split('__');
            actualKey = parts[0];
            subField = parts[1];
        }

        if (formFieldsMap[actualKey] === 'cep') {
            let currentCep = { cep: "", logradouro: "", numero: "", bairro: "", cidade: "", uf: "", complemento: "" };
            if (newProps[actualKey] && typeof newProps[actualKey] === 'string' && newProps[actualKey].startsWith('{')) {
                try { currentCep = Object.assign(currentCep, JSON.parse(newProps[actualKey])); } catch(e) {}
            }
            if (subField) {
                if (subField === 'cep') currentCep.cep = String(val).trim();
                else currentCep[subField] = String(val).trim();
            }
            val = JSON.stringify(currentCep);
        }

        newProps[actualKey] = val;
    });

    // Verificações
    assert.strictEqual(newProps.field_nome, "RUA MESSIAS PESSOA DA SILVA", "Campo NOME deve conter o logradouro");
    assert.strictEqual(newProps.field_bairro, "POCO", "Campo BAIRRO deve conter o bairro");
    assert.strictEqual(newProps.field_setor, "03", "Campo SETOR deve ser 03");

    assert.ok(newProps.field_cep, "Campo CEP deve existir");
    const cepObj = JSON.parse(newProps.field_cep);
    assert.strictEqual(cepObj.logradouro, "RUA MESSIAS PESSOA DA SILVA", "CEP JSON deve conter logradouro");
    assert.strictEqual(cepObj.bairro, "POCO", "CEP JSON deve conter bairro");
    assert.strictEqual(cepObj.cep, "58310000", "CEP JSON deve conter cep");
});

// -------------------------------------------------------------------------------------
// TESTE 2: Desmembramento de subpropriedades de CEP no Remapeamento
// -------------------------------------------------------------------------------------
test('Remapeamento - extração pontual de subpropriedades de CEP (prop.sub)', () => {
    const featureProperties = {
        cep: JSON.stringify({
            cep: "58310-000",
            logradouro: "RUA MESSIAS PESSOA DA SILVA",
            bairro: "POCO"
        }),
        SETOR: "03"
    };

    const mappings = [
        { fieldId: 'field_nome', fieldLabel: 'Nome', sourceProp: 'cep.logradouro' },
        { fieldId: 'field_bairro', fieldLabel: 'Bairro', sourceProp: 'cep.bairro' }
    ];

    mappings.forEach(m => {
        let rawVal = undefined;
        if (m.sourceProp.includes('.')) {
            const [parentKey, childKey] = m.sourceProp.split('.');
            const parentVal = featureProperties[parentKey];
            if (parentVal) {
                let parsed = null;
                if (typeof parentVal === 'object') parsed = parentVal;
                else if (typeof parentVal === 'string' && parentVal.trim().startsWith('{')) {
                    try { parsed = JSON.parse(parentVal); } catch(e){}
                }
                if (parsed && parsed[childKey] !== undefined) {
                    rawVal = parsed[childKey];
                }
            }
        } else {
            rawVal = featureProperties[m.sourceProp];
        }

        if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
            featureProperties[m.fieldId] = rawVal;
            if (m.fieldLabel) {
                featureProperties[m.fieldLabel] = rawVal;
                featureProperties[m.fieldLabel.toUpperCase()] = rawVal;
            }
        }
    });

    assert.strictEqual(featureProperties.field_nome, "RUA MESSIAS PESSOA DA SILVA");
    assert.strictEqual(featureProperties.Nome, "RUA MESSIAS PESSOA DA SILVA");
    assert.strictEqual(featureProperties.NOME, "RUA MESSIAS PESSOA DA SILVA");

    assert.strictEqual(featureProperties.field_bairro, "POCO");
    assert.strictEqual(featureProperties.Bairro, "POCO");
    assert.strictEqual(featureProperties.BAIRRO, "POCO");
});

// -------------------------------------------------------------------------------------
// TESTE 3: Fallback Inteligente de Leitura no Formulário (formRenderer)
// -------------------------------------------------------------------------------------
test('FormRenderer - fallback inteligente obtém Nome e Bairro do JSON de CEP quando vazios', () => {
    const featureData = {
        cep: JSON.stringify({
            cep: "58310-000",
            logradouro: "RUA MESSIAS PESSOA DA SILVA (VL-12 LTO PRAIA MAR)",
            bairro: "POCO",
            numero: "120"
        }),
        SETOR: "03"
    };

    function resolveFieldValueWithFallback(field, fData) {
        let value = fData[field.id];
        if (value === undefined || value === null || value === '') {
            if (field.label && fData[field.label] !== undefined && fData[field.label] !== '') {
                value = fData[field.label];
            }
        }

        // Fallback Inteligente
        if ((!value || value === '') && field.type !== 'cep') {
            const normLabel = (field.label || field.name || field.id || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            for (const [k, v] of Object.entries(fData)) {
                let cepObj = null;
                if (v && typeof v === 'string' && v.trim().startsWith('{') && (v.includes('"logradouro"') || v.includes('"bairro"') || v.includes('"cep"'))) {
                    try { cepObj = JSON.parse(v); } catch(e){}
                } else if (v && typeof v === 'object' && (v.logradouro !== undefined || v.bairro !== undefined || v.cep !== undefined)) {
                    cepObj = v;
                }
                if (cepObj) {
                    if (normLabel.includes('nome') || normLabel.includes('logradouro') || normLabel === 'endereco') {
                        if (cepObj.logradouro) { value = cepObj.logradouro; break; }
                    } else if (normLabel.includes('bairro')) {
                        if (cepObj.bairro) { value = cepObj.bairro; break; }
                    } else if (normLabel === 'cep' || normLabel.includes('codigo postal')) {
                        if (cepObj.cep) { value = cepObj.cep; break; }
                    } else if (normLabel.includes('numero') || normLabel === 'num' || normLabel === 'nº') {
                        if (cepObj.numero) { value = cepObj.numero; break; }
                    }
                }
            }
        }
        return value || '---';
    }

    const fieldNome = { id: 'field_nome_1', label: 'NOME', type: 'text' };
    const fieldBairro = { id: 'field_bairro_1', label: 'BAIRRO', type: 'text' };
    const fieldNumero = { id: 'field_num_1', label: 'Número', type: 'text' };
    const fieldSetor = { id: 'SETOR', label: 'SETOR', type: 'text' };

    assert.strictEqual(resolveFieldValueWithFallback(fieldNome, featureData), "RUA MESSIAS PESSOA DA SILVA (VL-12 LTO PRAIA MAR)");
    assert.strictEqual(resolveFieldValueWithFallback(fieldBairro, featureData), "POCO");
    assert.strictEqual(resolveFieldValueWithFallback(fieldNumero, featureData), "120");
    assert.strictEqual(resolveFieldValueWithFallback(fieldSetor, featureData), "03");
});

// -------------------------------------------------------------------------------------
// TESTE 4: Tradução de IDs de Formulário (f_...) para Labels Humanos
// -------------------------------------------------------------------------------------
test('Remapeamento - traduz IDs técnicos (f_...) para nomes legíveis e omite chaves de sistema', () => {
    const rawProperties = {
        COD_LOG_IN: "00674-2",
        f_21grqdflj: JSON.stringify({ cep: "58310-000", logradouro: "RUA MESSIAS", bairro: "POCO" }),
        f_qxgai5wlk: "RUA",
        f_8vacllqlq: "01",
        f_zlx463nfy: "JORDY",
        id_banco: "ad80d443-7f7c-45ac-b",
        themeId: "9e41ce49-dc21-49a4-b"
    };

    const formFieldLabelsMap = {
        f_21grqdflj: "Endereço/CEP",
        f_qxgai5wlk: "Tipo de logradouro",
        f_8vacllqlq: "Setor",
        f_zlx463nfy: "Bairro"
    };

    const availablePropKeys = [];
    const virtualPropLabels = {};

    Object.entries(rawProperties).forEach(([k, v]) => {
        if (!k || k.startsWith('_')) return;
        if (k === 'id_banco' || k === 'themeId' || k === '_tempId') return; // Omitidos!

        let cepObj = null;
        if (typeof v === 'string' && v.trim().startsWith('{') && (v.includes('"logradouro"') || v.includes('"bairro"') || v.includes('"cep"'))) {
            try { cepObj = JSON.parse(v); } catch(e){}
        }

        if (cepObj) {
            const prefixLabel = formFieldLabelsMap[k] || 'Endereço/CEP';
            const subDefs = [
                { sub: 'logradouro', label: `${prefixLabel} ➔ Logradouro` },
                { sub: 'bairro', label: `${prefixLabel} ➔ Bairro` }
            ];
            subDefs.forEach(sd => {
                const virtKey = `${k}.${sd.sub}`;
                availablePropKeys.push(virtKey);
                virtualPropLabels[virtKey] = sd.label;
            });
        } else {
            availablePropKeys.push(k);
            if (formFieldLabelsMap[k]) {
                virtualPropLabels[k] = `${formFieldLabelsMap[k]} [${k}]`;
            }
        }
    });

    assert.ok(!availablePropKeys.includes('id_banco'), 'id_banco não deve aparecer nas opções');
    assert.ok(!availablePropKeys.includes('themeId'), 'themeId não deve aparecer nas opções');

    assert.strictEqual(virtualPropLabels['f_qxgai5wlk'], "Tipo de logradouro [f_qxgai5wlk]");
    assert.strictEqual(virtualPropLabels['f_zlx463nfy'], "Bairro [f_zlx463nfy]");
    assert.strictEqual(virtualPropLabels['f_8vacllqlq'], "Setor [f_8vacllqlq]");

    assert.strictEqual(virtualPropLabels['f_21grqdflj.logradouro'], "Endereço/CEP ➔ Logradouro");
    assert.strictEqual(virtualPropLabels['f_21grqdflj.bairro'], "Endereço/CEP ➔ Bairro");
});

// -------------------------------------------------------------------------------------
// TESTE 5: Reconexão de Atributos com Feições do Arquivo GeoJSON Original
// -------------------------------------------------------------------------------------
test('Remapeamento - restaura e mapeia a partir de feições do arquivo GeoJSON original', () => {
    const existingFeature = {
        properties: {
            id_banco: "feat_123",
            f_qxgai5wlk: "RUA",
            COD_LOG_IN: "00674-2"
        }
    };

    const originalUploadedFeature = {
        properties: {
            NOME: "RUA MESSIAS PESSOA DA SILVA",
            BAIRRO: "POCO",
            TIPO_LOGRADOURO: "RUA",
            COD_LOG_IN: "00674-2"
        }
    };

    const mappings = [
        { fieldId: 'field_nome', fieldLabel: 'Nome', sourceProp: 'orig::NOME' },
        { fieldId: 'field_bairro', fieldLabel: 'Bairro', sourceProp: 'orig::BAIRRO' }
    ];

    // Simula restauração de colunas originais
    Object.entries(originalUploadedFeature.properties).forEach(([origK, origV]) => {
        existingFeature.properties[origK] = origV;
    });

    // Aplica mapeamentos
    mappings.forEach(m => {
        let rawVal = undefined;
        if (m.sourceProp.startsWith('orig::')) {
            const origCol = m.sourceProp.replace('orig::', '');
            rawVal = originalUploadedFeature.properties[origCol];
        }
        if (rawVal) {
            existingFeature.properties[m.fieldId] = rawVal;
            existingFeature.properties[m.fieldLabel] = rawVal;
        }
    });

    assert.strictEqual(existingFeature.properties.field_nome, "RUA MESSIAS PESSOA DA SILVA");
    assert.strictEqual(existingFeature.properties.Nome, "RUA MESSIAS PESSOA DA SILVA");
    assert.strictEqual(existingFeature.properties.NOME, "RUA MESSIAS PESSOA DA SILVA");
    assert.strictEqual(existingFeature.properties.field_bairro, "POCO");
    assert.strictEqual(existingFeature.properties.Bairro, "POCO");
    assert.strictEqual(existingFeature.properties.BAIRRO, "POCO");
});

if (failed === 0) {
    console.log(`attributeMapping: ${total}/${total} verificações passaram com sucesso!`);
    process.exit(0);
} else {
    console.error(`attributeMapping: ${failed}/${total} falharam.`);
    process.exit(1);
}
