// tests/strokeFillOpacity.test.js
const assert = require('assert');

function computeLeafletStyle(theme, feature) {
    let color = theme ? theme.color : '#333333';
    let weight = theme && theme.weight !== undefined ? theme.weight : 2;
    let dashArray = theme && theme.dashed ? '5, 5' : '';

    // Resolução independente de opacidade da aresta e do preenchimento:
    let strokeOpacity = 1;
    if (theme) {
      if (theme.strokeOpacity !== undefined) strokeOpacity = Number(theme.strokeOpacity);
      else if (theme.stroke_opacity !== undefined) strokeOpacity = Number(theme.stroke_opacity);
      else if (theme.opacity !== undefined && theme.opacity <= 0.001) strokeOpacity = 0; // retrocompatibilidade opacidade 0%
      else strokeOpacity = 1;
    }

    let fillOpacity = 0.4;
    if (theme) {
      if (theme.fillOpacity !== undefined) fillOpacity = Number(theme.fillOpacity);
      else if (theme.fill_opacity !== undefined) fillOpacity = Number(theme.fill_opacity);
      else if (theme.opacity !== undefined) fillOpacity = Number(theme.opacity);
      else fillOpacity = 0.4;
    }

    const geomType = feature && feature.geometry ? feature.geometry.type : '';
    const isLineGeom = geomType === 'LineString' || geomType === 'MultiLineString';
    const isLineTheme = theme && (
      theme.geometryType === 'Linha' || 
      theme.geometryType === 'LineString' || 
      theme.geometryType === 'MultiLineString'
    );

    let shouldFill = true;
    if (theme && theme.fill !== undefined) {
      shouldFill = !!theme.fill;
    } else if (isLineGeom || isLineTheme) {
      shouldFill = false;
    }

    const isStrokeZero = strokeOpacity <= 0.001;
    const isFillZero = fillOpacity <= 0.001 || !shouldFill;

    const strokeVisible = !isStrokeZero;
    const fillVisible = shouldFill && !isFillZero && !isLineGeom && !isLineTheme;

    return {
      stroke: strokeVisible,
      fill: fillVisible,
      fillColor: fillVisible ? color : 'transparent',
      fillOpacity: fillVisible ? fillOpacity : 0,
      color: color,
      opacity: strokeVisible ? strokeOpacity : 0,
      weight: strokeVisible ? weight : 0,
      dashArray: dashArray
    };
}

console.log('Executando testes de transparência independente de aresta e preenchimento...');

const polyFeature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0,0], [1,0], [1,1], [0,0]]] } };
const lineFeature = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0,0], [1,1]] } };

// Caso 1: Usuário quer ver apenas a aresta (preenchimento 0% ou desativado, aresta 100% com espessura 3 e tracejado)
{
    const themeArestaVisivel = {
        name: 'CTM-Municipal',
        color: '#00d2be',
        strokeOpacity: 1.0,
        fillOpacity: 0.0,
        weight: 3,
        dashed: true,
        fill: true
    };
    const style = computeLeafletStyle(themeArestaVisivel, polyFeature);
    assert.strictEqual(style.stroke, true, 'Aresta deve estar visível');
    assert.strictEqual(style.opacity, 1.0, 'Opacidade da aresta deve ser 100%');
    assert.strictEqual(style.weight, 3, 'Espessura da linha deve ser 3px');
    assert.strictEqual(style.dashArray, '5, 5', 'Linha deve ser tracejada');
    assert.strictEqual(style.fill, false, 'Preenchimento deve estar invisível com 0%');
    assert.strictEqual(style.fillOpacity, 0, 'fillOpacity deve ser 0');
    console.log('✓ Teste 1: Preenchimento 0% mantém aresta 100% visível, colorida, espessa e tracejada');
}

// Caso 2: Preenchimento sutil (20%) e aresta forte (100%)
{
    const themeSutil = {
        name: 'Lotes',
        color: '#2563eb',
        strokeOpacity: 1.0,
        fillOpacity: 0.2,
        weight: 2,
        dashed: false,
        fill: true
    };
    const style = computeLeafletStyle(themeSutil, polyFeature);
    assert.strictEqual(style.stroke, true, 'Aresta deve estar ativa');
    assert.strictEqual(style.opacity, 1.0, 'Opacidade da aresta deve ser 1.0');
    assert.strictEqual(style.fill, true, 'Preenchimento deve estar ativo');
    assert.strictEqual(style.fillOpacity, 0.2, 'fillOpacity deve ser 0.2');
    console.log('✓ Teste 2: Preenchimento 20% com aresta 100% aplicado perfeitamente');
}

// Caso 3: Aresta invisível (0%) e preenchimento visível (50%)
{
    const themeSemBorda = {
        name: 'Mancha Urbana',
        color: '#dc2626',
        strokeOpacity: 0.0,
        fillOpacity: 0.5,
        weight: 2,
        fill: true
    };
    const style = computeLeafletStyle(themeSemBorda, polyFeature);
    assert.strictEqual(style.stroke, false, 'Aresta deve estar desativada');
    assert.strictEqual(style.opacity, 0, 'stroke opacity deve ser 0');
    assert.strictEqual(style.weight, 0, 'weight deve ser 0');
    assert.strictEqual(style.fill, true, 'Preenchimento deve estar ativo');
    assert.strictEqual(style.fillOpacity, 0.5, 'fillOpacity deve ser 0.5');
    console.log('✓ Teste 3: Aresta 0% desativa a borda e preserva o preenchimento a 50%');
}

// Caso 4: Tema de Linhas pura (Logradouro / Curvas de Nível) com strokeOpacity
{
    const themeLinha = {
        name: 'Logradouro',
        color: '#f59e0b',
        geometryType: 'Linha',
        strokeOpacity: 0.85,
        weight: 4
    };
    const style = computeLeafletStyle(themeLinha, lineFeature);
    assert.strictEqual(style.stroke, true, 'Linha deve estar visível');
    assert.strictEqual(style.opacity, 0.85, 'Opacidade da linha deve ser 0.85');
    assert.strictEqual(style.weight, 4, 'Weight da linha deve ser 4');
    assert.strictEqual(style.fill, false, 'Linha nunca deve ter fill');
    console.log('✓ Teste 4: Temas de linha utilizam strokeOpacity perfeitamente');
}

// Caso 5: Retrocompatibilidade com temas legados (só possuem opacity: 0.4)
{
    const themeLegado = {
        name: 'Tema Antigo',
        color: '#10b981',
        opacity: 0.4,
        weight: 2
    };
    const style = computeLeafletStyle(themeLegado, polyFeature);
    assert.strictEqual(style.stroke, true, 'Tema legado mantém aresta visível por padrão');
    assert.strictEqual(style.opacity, 1.0, 'Aresta padrão é 1.0');
    assert.strictEqual(style.fill, true, 'Preenchimento legado é 0.4');
    assert.strictEqual(style.fillOpacity, 0.4, 'fillOpacity legado preservado');
    console.log('✓ Teste 5: Retrocompatibilidade com temas legados 100% garantida');
}

console.log('Todos os testes de opacidade independente passaram com sucesso!');
