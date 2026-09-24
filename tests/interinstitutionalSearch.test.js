const assert = require('assert');
const searchModule = require('../src/interinstitutional-search.js');

console.log('--- Iniciando Testes Unitários de Pesquisa Interinstitucional ---');

// 1. Teste de Dígitos e Formatação
assert.strictEqual(searchModule.digitsOf('0800587-11.2024.4.05.8200'), '08005871120244058200');
assert.strictEqual(searchModule.digitsOf('19650001155-06'), '1965000115506');
assert.strictEqual(searchModule.digitsOf('2023.1234567'), '20231234567');

// 2. Teste de Máscaras
assert.strictEqual(searchModule.maskIpl('08005871120244058200'), '0800587-11.2024.4.05.8200');
assert.strictEqual(searchModule.maskEpol('20231234567'), '2023.1234567');
assert.strictEqual(searchModule.maskRip('1965000115506'), '19650001155-06');

// 3. Teste de Detecção de Ente
const mpfConfig = searchModule.detectUserEnteConfig({ entidade: 'Ministério Público Federal' });
assert.strictEqual(mpfConfig.sigla, 'MPF');
assert.strictEqual(mpfConfig.defaultType, 'ipl');

const pfConfig = searchModule.detectUserEnteConfig({ entidade: 'Polícia Federal - DPF' });
assert.strictEqual(pfConfig.sigla, 'PF');
assert.strictEqual(pfConfig.defaultType, 'epol');

const spuConfig = searchModule.detectUserEnteConfig({ entidade: 'Superintendência do Patrimônio da União' });
assert.strictEqual(spuConfig.sigla, 'SPU');
assert.strictEqual(spuConfig.defaultType, 'rip');

const superConfig = searchModule.detectUserEnteConfig({ super_admin: true });
assert.strictEqual(superConfig.sigla, 'SUPER');
assert.strictEqual(superConfig.defaultType, 'todos');

// 4. Teste de propertyMatchesTerm (Garantia contra falsos positivos)
// Busca por número longo NÃO deve dar match em dígitos simples ou propriedades irrelevantes
const searchIPL = '0800587-11.2024.4.05.8200';
const cleanTerm = searchIPL.toLowerCase().trim();
const rawDigits = searchModule.digitsOf(searchIPL);

assert.strictEqual(searchModule.propertyMatchesTerm('1', cleanTerm, rawDigits), false, 'Não deve casar dígito 1');
assert.strictEqual(searchModule.propertyMatchesTerm(1, cleanTerm, rawDigits), false, 'Não deve casar número 1');
assert.strictEqual(searchModule.propertyMatchesTerm('4', cleanTerm, rawDigits), false, 'Não deve casar dígito 4');
assert.strictEqual(searchModule.propertyMatchesTerm('2024', cleanTerm, rawDigits), false, 'Não deve casar apenas o ano 2024 solto');

// Deve casar com o valor exato, formatado ou em dígitos puros
assert.strictEqual(searchModule.propertyMatchesTerm('0800587-11.2024.4.05.8200', cleanTerm, rawDigits), true);
assert.strictEqual(searchModule.propertyMatchesTerm('08005871120244058200', cleanTerm, rawDigits), true);

// Busca por prefixo/parcial
const partialTerm = '0800587';
const partialDigits = searchModule.digitsOf(partialTerm);
assert.strictEqual(searchModule.propertyMatchesTerm('0800587-11.2024.4.05.8200', partialTerm, partialDigits), true);

// 5. Teste de extração de valor em sub-abas / objetos
const nestedObj = { sub_tab: [{ ipl_field: '0800587-11.2024.4.05.8200' }] };
assert.strictEqual(searchModule.propertyMatchesTerm(nestedObj, cleanTerm, rawDigits), true);
assert.strictEqual(searchModule.extractMatchedValue(nestedObj, cleanTerm, rawDigits), '0800587-11.2024.4.05.8200');

console.log('✓ Todos os testes unitários de Pesquisa Interinstitucional passaram com sucesso!');
