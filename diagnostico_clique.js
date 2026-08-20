// Copie e cole este código inteiro no Console do seu navegador (F12 > Console) e dê Enter.
// Depois, reproduza o problema (ative/desative o gráfico, abra a feição e tente clicar na aba).
// O console vai mostrar EXATAMENTE quem está engolindo o seu clique.

document.addEventListener('mousedown', function(e) {
    // 1. Pegar o elemento exato onde o clique físico bateu (o topo do z-index)
    const elementHit = document.elementFromPoint(e.clientX, e.clientY);
    
    // 2. Pegar as informações do elemento
    let info = "❌ CLIQUE BLOQUEADO/INTERCEPTADO POR:\n";
    if (elementHit) {
        info += `- Tag: ${elementHit.tagName}\n`;
        info += `- ID: ${elementHit.id || 'Nenhum'}\n`;
        info += `- Classes: ${elementHit.className}\n`;
        
        // Pega o z-index computado
        const computedStyle = window.getComputedStyle(elementHit);
        info += `- Z-Index Real: ${computedStyle.zIndex}\n`;
        info += `- Display: ${computedStyle.display}\n`;
        info += `- Pointer-Events: ${computedStyle.pointerEvents}\n`;
        
        // Vamos checar os parentes para ver se tem um culpado invisível
        let parent = elementHit.parentElement;
        let parentHierarchy = [];
        while (parent && parent.tagName !== 'HTML') {
            parentHierarchy.push(`${parent.tagName}#${parent.id || 'sem-id'}`);
            parent = parent.parentElement;
        }
        info += `- Hierarquia: ${parentHierarchy.join(' -> ')}\n`;
    } else {
        info += "Nenhum elemento detectado nas coordenadas do mouse!";
    }

    console.log("%c--- DIAGNÓSTICO DE CLIQUE ---", "color: yellow; font-weight: bold; background: black; padding: 4px;");
    console.log(info);
}, { capture: true });

console.log("%c✅ Rastreador de cliques ativado! Pode reproduzir o erro agora.", "color: lime; font-weight: bold; background: black; padding: 4px;");
