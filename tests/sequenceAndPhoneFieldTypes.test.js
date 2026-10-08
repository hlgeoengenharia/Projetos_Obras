const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Carrega customFields para testar getNextAlphanumericSequence e maskPhone
const customFieldsCode = fs.readFileSync(path.join(__dirname, '../src/customFields.js'), 'utf8');

// Cria sandbox para extrair as funções
const sandbox = {
    window: {},
    document: {
        getElementById: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {}
    }
};
const fn = new Function('window', 'document', customFieldsCode + '; return { getNextAlphanumericSequence: window.getNextAlphanumericSequence, maskPhone: window.maskPhone, generateFeatureInputHtml: window.generateFeatureInputHtml };');
const { getNextAlphanumericSequence, maskPhone, generateFeatureInputHtml } = fn(sandbox.window, sandbox.document);

const FieldFormatter = require('../src/fieldFormatter.js');

test('Auto-incremento: getNextAlphanumericSequence incrementa padrões corretamente', () => {
    // Cenário básico solicitado pelo usuário: A1 -> A2 -> A3
    assert.equal(getNextAlphanumericSequence('A1'), 'A2');
    assert.equal(getNextAlphanumericSequence('A2'), 'A3');
    assert.equal(getNextAlphanumericSequence('A9'), 'A10');

    // Preservação de zeros à esquerda
    assert.equal(getNextAlphanumericSequence('A01'), 'A02');
    assert.equal(getNextAlphanumericSequence('A09'), 'A10');
    assert.equal(getNextAlphanumericSequence('001'), '002');
    assert.equal(getNextAlphanumericSequence('099'), '100');

    // Prefixos com palavras e traços
    assert.equal(getNextAlphanumericSequence('Lote 01'), 'Lote 02');
    assert.equal(getNextAlphanumericSequence('Lote 09'), 'Lote 10');
    assert.equal(getNextAlphanumericSequence('Q-01'), 'Q-02');
    assert.equal(getNextAlphanumericSequence('POSTE-100'), 'POSTE-101');
    assert.equal(getNextAlphanumericSequence('P-1'), 'P-2');

    // Apenas número
    assert.equal(getNextAlphanumericSequence('1'), '2');
    assert.equal(getNextAlphanumericSequence('50'), '51');

    // Letras simples
    assert.equal(getNextAlphanumericSequence('A'), 'B');
    assert.equal(getNextAlphanumericSequence('B'), 'C');

    // Valor vazio ou nulo usa defaultStart (A1 por padrão)
    assert.equal(getNextAlphanumericSequence(''), 'A1');
    assert.equal(getNextAlphanumericSequence(null), 'A1');
    assert.equal(getNextAlphanumericSequence('', '01'), '01');
    assert.equal(getNextAlphanumericSequence('', 'Lote 1'), 'Lote 1');
});

test('Máscara de telefone: maskPhone formata telefones fixos e celulares (10 e 11 dígitos)', () => {
    const input11 = { value: '83988887777' };
    maskPhone(input11);
    assert.equal(input11.value, '(83) 98888-7777');

    const input10 = { value: '8332221111' };
    maskPhone(input10);
    assert.equal(input10.value, '(83) 3222-1111');
});

test('FieldFormatter formata phone e sequence corretamente', () => {
    // Phone
    assert.equal(FieldFormatter.toText('83988887777', { type: 'phone' }), '(83) 98888-7777');
    assert.equal(FieldFormatter.toText('8332221111', { type: 'phone' }), '(83) 3222-1111');

    // Sequence
    assert.equal(FieldFormatter.toText('A1', { type: 'sequence' }), 'A1');
    assert.equal(FieldFormatter.toText('Lote 05', { type: 'sequence' }), 'Lote 05');
});

test('generateFeatureInputHtml renderiza sequence e phone no modo edição e leitura', () => {
    // Edição Sequence
    const editSeq = generateFeatureInputHtml({ id: 'campo_seq', type: 'sequence' }, 'A2', true);
    assert.ok(editSeq.includes('id="sequence-input-campo_seq"'));
    assert.ok(editSeq.includes('value="A2"'));
    assert.ok(editSeq.includes('SEQ'));

    // Leitura Sequence
    const viewSeq = generateFeatureInputHtml({ id: 'campo_seq', type: 'sequence' }, 'A2', false);
    assert.ok(viewSeq.includes('A2'));
    assert.ok(viewSeq.includes('font-mono'));

    // Edição Phone
    const editPhone = generateFeatureInputHtml({ id: 'campo_tel', type: 'phone' }, '83988887777', true);
    assert.ok(editPhone.includes('id="phone-input-campo_tel"'));
    assert.ok(editPhone.includes('(83) 98888-7777'));
    assert.ok(editPhone.includes('maskPhone(this)'));

    // Leitura Phone com link para WhatsApp
    const viewPhone = generateFeatureInputHtml({ id: 'campo_tel', type: 'phone' }, '83988887777', false);
    assert.ok(viewPhone.includes('(83) 98888-7777'));
    assert.ok(viewPhone.includes('href="https://wa.me/5583988887777"'));
    assert.ok(viewPhone.includes('WhatsApp'));
});

console.log('✅ Todos os testes de Número em Sequência e Contato/Telefone passaram com 100% de sucesso!');
