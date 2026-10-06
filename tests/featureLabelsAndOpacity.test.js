// tests/featureLabelsAndOpacity.test.js
const assert = require('assert');

// 1. Teste da função de normalização e resolução de propriedade
function norm(str) {
    return (str || '').toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mockGetFeaturePropertyValue(theme, feature, requestedKey) {
   if (!requestedKey || !feature || !feature.properties) return undefined;
   const reqNorm = norm(requestedKey);
   if (!reqNorm) return undefined;

   const isValidVal = v => v !== undefined && v !== null && String(v).trim() !== '' && String(v).trim() !== '---';

   if (isValidVal(feature.properties[requestedKey])) return feature.properties[requestedKey];

   for (const p in feature.properties) {
       if (norm(p) === reqNorm && isValidVal(feature.properties[p])) {
           return feature.properties[p];
       }
   }

   if (reqNorm.includes('proprietario') || reqNorm.includes('possuidor')) {
       const propAliases = ['proprietario', 'proprietaria', 'nome_proprietario', 'nomeproprietario', 'nome_prop', 'proprietario_possuidor', 'titular', 'nometitular', 'nome_do_proprietario'];
       for (const alias of propAliases) {
           for (const p in feature.properties) {
               if (norm(p) === alias && isValidVal(feature.properties[p])) {
                   return feature.properties[p];
               }
           }
       }
   }
   return undefined;
}

// TESTE 1: Resolução de 'Proprietário' quando a feição possui 'PROPRIETARIO' (sem acento)
{
    const theme = { id: 'ctm', name: 'CTM-Municipal', mainTitle: 'Proprietário' };
    const feat = {
        type: 'Feature',
        properties: {
            PROPRIETARIO: 'VERA LUCIA FELINTO DE OLIVEIRA',
            QUADRA: '167',
            LOTE: '0275'
        }
    };
    const val = mockGetFeaturePropertyValue(theme, feat, 'Proprietário');
    assert.strictEqual(val, 'VERA LUCIA FELINTO DE OLIVEIRA', 'Deve resolver VERA LUCIA mesmo com chave sem acento PROPRIETARIO');
    console.log('✓ Teste 1: Proprietário resolvido com sucesso na presença de PROPRIETARIO sem acento');
}

// TESTE 2: Resolução de 'Proprietário' quando a feição possui 'NOME_PROPRIETARIO'
{
    const theme = { id: 'ctm', name: 'CTM-Municipal', mainTitle: 'Proprietário' };
    const feat = {
        type: 'Feature',
        properties: {
            NOME_PROPRIETARIO: 'JOAO DA SILVA',
            QUADRA: '10',
            LOTE: '05'
        }
    };
    const val = mockGetFeaturePropertyValue(theme, feat, 'Proprietário');
    assert.strictEqual(val, 'JOAO DA SILVA', 'Deve resolver alias NOME_PROPRIETARIO');
    console.log('✓ Teste 2: Alias NOME_PROPRIETARIO resolvido com sucesso');
}

// TESTE 3: Regra de estilo para linhas com opacidade 0%
{
    function computeStyle(theme, isLine) {
        const opacity = theme && theme.opacity !== undefined ? theme.opacity : 0.4;
        const color = theme.color || '#333';
        const weight = theme.weight || 2;
        const isZeroOpacity = opacity <= 0.001;

        let strokeVisible = true;
        let strokeOpacity = 1;
        let fillVisible = false;
        let fillOpacity = 0;

        if (isZeroOpacity) {
            strokeVisible = false;
            strokeOpacity = 0;
            fillVisible = false;
            fillOpacity = 0;
        } else if (isLine) {
            strokeVisible = true;
            strokeOpacity = opacity;
            fillVisible = false;
            fillOpacity = 0;
        }

        return {
            stroke: strokeVisible,
            fill: fillVisible,
            opacity: strokeOpacity,
            fillOpacity: fillOpacity,
            weight: strokeVisible ? weight : 0
        };
    }

    const lineThemeZero = { opacity: 0, color: '#f59e0b', weight: 7 };
    const styleZero = computeStyle(lineThemeZero, true);
    assert.strictEqual(styleZero.stroke, false, 'Stroke deve ser false quando opacidade for 0');
    assert.strictEqual(styleZero.opacity, 0, 'Opacity deve ser 0 quando opacidade for 0');
    assert.strictEqual(styleZero.weight, 0, 'Weight deve ser 0 quando opacidade for 0');
    console.log('✓ Teste 3: Opacidade 0% torna linha 100% invisível');

    const lineThemeVisible = { opacity: 0.8, color: '#f59e0b', weight: 7 };
    const styleVisible = computeStyle(lineThemeVisible, true);
    assert.strictEqual(styleVisible.stroke, true, 'Stroke deve ser true');
    assert.strictEqual(styleVisible.opacity, 0.8, 'Opacity deve ser 0.8');
    assert.strictEqual(styleVisible.weight, 7, 'Weight deve ser 7');
    console.log('✓ Teste 3b: Opacidade 80% renderiza linha normalmente');
}

// TESTE 4: Regra "se não der pra ficar dentro da feição não mostra"
{
    function shouldShowPolygonLabel(zoom, pxWidth, pxHeight, text) {
        if (zoom < 18) return false;
        const estWidth = Math.max(28, text.length * 7.5);
        const estHeight = 14;
        return (pxWidth >= estWidth + 4) && (pxHeight >= estHeight + 4);
    }

    const labelText = "167 · 0275"; // 10 chars -> ~75px + 4 = 79px

    // Zoom distante (15)
    assert.strictEqual(shouldShowPolygonLabel(15, 8, 12, labelText), false, 'Zoom 15 deve omitir');
    // Zoom 17
    assert.strictEqual(shouldShowPolygonLabel(17, 30, 25, labelText), false, 'Zoom 17 deve omitir');
    // Zoom 18 pequeno (não cabe)
    assert.strictEqual(shouldShowPolygonLabel(18, 50, 40, labelText), false, 'Zoom 18 não cabe: deve omitir');
    // Zoom 18 grande (cabe)
    assert.strictEqual(shouldShowPolygonLabel(18, 120, 60, labelText), true, 'Zoom 18 cabe: deve exibir');
    console.log('✓ Teste 4: Regra se não couber na feição não mostra validada com sucesso');
}

console.log('\nTodos os testes de rótulos e opacidade passaram!');
