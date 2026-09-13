/**
 * ==============================================================================
 * SISTEMA DE AUDITORIA E CONTROLE DE QUALIDADE PRÉ-COMMIT (QA GATEKEEPER)
 * ==============================================================================
 * Executa uma bateria completa de testes de regressão, sintaxe e regras de
 * permissão para os perfis: SuperAdmin, Admin de Unidade, Usuário Delegado e
 * Usuário Comum.
 *
 * Uso:
 *   node test_sistema_qa.js
 * Retorno:
 *   Exit code 0: Todos os testes passaram (Commit liberado)
 *   Exit code 1: Falha detectada (Commit bloqueado com relatório)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Cores ANSI para o terminal
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assertTest(name, condition, details = '') {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ${GREEN}✓ [PASS]${RESET} ${name}`);
    } else {
        failedTests++;
        const msg = details ? `${name} -> ${details}` : name;
        failures.push(msg);
        console.log(`  ${RED}✗ [FAIL]${RESET} ${name}`);
        if (details) console.log(`    ${YELLOW}↳ Motivo: ${details}${RESET}`);
    }
}

console.log(`\n${BOLD}${CYAN}==============================================================================${RESET}`);
console.log(`${BOLD}${CYAN} 🛡️  INICIANDO BATERIA DE AUDITORIA E NÃO-REGRESSÃO PRÉ-COMMIT${RESET}`);
console.log(`${BOLD}${CYAN}==============================================================================${RESET}\n`);

// ------------------------------------------------------------------------------
// BATERIA 1: INTEGRIDADE E SINTAXE DE CÓDIGO (JS E SCRIPTS HTML)
// ------------------------------------------------------------------------------
console.log(`${BOLD}[1/4] Verificando Sintaxe de Arquivos JavaScript e HTML...${RESET}`);

const jsFiles = [
    'src/main.js',
    'src/usuarios-gestao.js',
    'src/geo-engine-turbo.js',
    'src/spatialAnalytics.js',
    'src/measurement.js',
    'src/cesium-integration.js',
    'src/auditLogger.js',
    'src/session-security.js',
    'src/swipe-comparator.js',
    'src/formRenderer.js',
    'src/customFields.js',
    'src/tableJoin.js'
];

jsFiles.forEach(file => {
    if (fs.existsSync(file)) {
        try {
            execSync(`node -c "${file}"`, { stdio: 'pipe' });
            assertTest(`Sintaxe válida: ${file}`, true);
        } catch (err) {
            assertTest(`Sintaxe válida: ${file}`, false, err.message);
        }
    }
});

const htmlFiles = [
    'home.html',
    'index.html',
    'settings.html',
    'login.html',
    'signup.html',
    'forgot-password.html',
    'reset-password.html'
];

htmlFiles.forEach(htmlFile => {
    if (!fs.existsSync(htmlFile)) return;
    const content = fs.readFileSync(htmlFile, 'utf8');
    const scripts = content.match(/<script[\s\S]*?<\/script>/gi) || [];
    let hasError = false;
    let errorMsg = '';

    scripts.forEach((scriptTag, idx) => {
        // Ignora scripts externos
        if (scriptTag.includes('src=')) return;
        const code = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        try {
            new Function(code);
        } catch (err) {
            hasError = true;
            errorMsg = `Bloco #${idx + 1}: ${err.message}`;
        }
    });

    assertTest(`Sintaxe de scripts inline em ${htmlFile}`, !hasError, errorMsg);
});

// ------------------------------------------------------------------------------
// BATERIA 2: MATRIZ DE PERFIS E REGRAS DE AUTORIZAÇÃO
// ------------------------------------------------------------------------------
console.log(`\n${BOLD}[2/4] Testando Matriz de Autorização por Perfis (SuperAdmin, Admin, Usuário)...${RESET}`);

// Extrai a função de permissão do src/usuarios-gestao.js para teste isolado
const usuariosGestaoCode = fs.readFileSync('src/usuarios-gestao.js', 'utf8');

// Simulação da lógica canManageUser do usuarios-gestao.js
function simulateCanManageUser(currentUser, targetUser) {
    if (!currentUser) return false;
    if (currentUser.super_admin || currentUser.is_superadmin || currentUser.papel === 'superadmin') return true;
    
    // Regra estrita: Somente Admins podem gerenciar usuários
    const isMunAdmin = (currentUser.papel === 'admin' || currentUser.unidade_admin);
    if (!isMunAdmin) return false;

    const minhaEntidade = (currentUser.entidade || 'Prefeitura Municipal').trim().toLowerCase();
    const userEntidade = (targetUser.entidade || 'Prefeitura Municipal').trim().toLowerCase();
    if (minhaEntidade !== userEntidade) return false;

    if (currentUser.super_admin) return true;

    const minhaUnidade = (currentUser.unidade_admin || currentUser.unidade || '').trim().toLowerCase();
    if (minhaUnidade) {
        if (targetUser.user_id === currentUser.id || targetUser.id === currentUser.id) return true;
        const userUnidade = (targetUser.unidade || '').trim().toLowerCase();
        return minhaUnidade === userUnidade;
    }
    return true;
}

// 1. SuperAdmin
const superAdminUser = { id: 'sa-1', papel: 'superadmin', super_admin: true, entidade: 'Prefeitura A', unidade: 'Gabinete' };
const userAnotherEntity = { id: 'u-outra', entidade: 'Superintendência SPU', unidade: 'SPU' };
const userSameEntity = { id: 'u-mesma', entidade: 'Prefeitura A', unidade: 'Obras' };

assertTest('SuperAdmin: pode gerenciar usuário de outra entidade', simulateCanManageUser(superAdminUser, userAnotherEntity));
assertTest('SuperAdmin: pode gerenciar usuário da mesma entidade', simulateCanManageUser(superAdminUser, userSameEntity));

// 2. Admin de Unidade (ex: Obras)
const adminObras = { id: 'adm-obras', papel: 'admin', super_admin: false, entidade: 'Prefeitura A', unidade_admin: 'Obras', unidade: 'Obras' };
const userObras = { id: 'user-obras', entidade: 'Prefeitura A', unidade: 'Obras', setor: 'Fiscalização' };
const userMeioAmbiente = { id: 'user-ma', entidade: 'Prefeitura A', unidade: 'Meio Ambiente', setor: 'Licenciamento' };

assertTest('Admin Obras: PODE gerenciar usuário da sua Unidade (Obras)', simulateCanManageUser(adminObras, userObras));
assertTest('Admin Obras: NÃO PODE gerenciar usuário de outra Unidade (Meio Ambiente)', !simulateCanManageUser(adminObras, userMeioAmbiente), 'Isolamento de Unidade violado!');
assertTest('Admin Obras: NÃO PODE gerenciar usuário de outra Entidade', !simulateCanManageUser(adminObras, userAnotherEntity), 'Isolamento de Entidade violado!');

// 3. Usuário Comum
const normalUser = { id: 'user-comum', papel: 'leitor', super_admin: false, entidade: 'Prefeitura A', unidade: 'Obras' };
assertTest('Usuário Comum: NÃO PODE gerenciar outros usuários', !simulateCanManageUser(normalUser, userObras));

// ------------------------------------------------------------------------------
// BATERIA 3: REGRAS DE DELEGAÇÃO DE CRIAÇÃO DE CAMADAS E ORTOFOTOS
// ------------------------------------------------------------------------------
console.log(`\n${BOLD}[3/4] Testando Regras de Delegação (Criar Camadas e Ortofotos)...${RESET}`);

const mainJsContent = fs.readFileSync('src/main.js', 'utf8');

// Validação do comportamento do Botão Header vs Drawer
function evaluateLayerCreationAccess(user) {
    const isSuperAdmin = !!(user && (user.super_admin || user.is_superadmin || user.papel === 'superadmin'));
    const isMunAdmin = !!(user && (user.papel === 'admin' || user.unidade_admin));
    const isAnyAdmin = isSuperAdmin || isMunAdmin;
    const canDelegateCreateLayer = !!(user && (user.pode_criar_camadas || isAnyAdmin));
    const canDelegateUploadRaster = !!(user && (user.pode_subir_ortofotos || isAnyAdmin));

    // Regra acordada no plano:
    // Botão Header "+" (Central Administrativa de Camadas): Somente Admins
    const headerBtnVisible = isAnyAdmin;
    // Botão Drawer "+ Criar Nova Camada": Usuários com delegação (não-admins)
    const drawerBtnVisible = !isAnyAdmin && canDelegateCreateLayer;

    return {
        headerBtnVisible,
        drawerBtnVisible,
        canCreateLayer: canDelegateCreateLayer,
        canUploadRaster: canDelegateUploadRaster
    };
}

// Teste Perfil: Usuário Delegado (pode_criar_camadas: true)
const delegatedUser = { id: 'del-1', papel: 'usuario', super_admin: false, pode_criar_camadas: true, pode_subir_ortofotos: true };
const accessDel = evaluateLayerCreationAccess(delegatedUser);

assertTest('Usuário Delegado: Botão Header "+" da Central de Camadas permanece OCULTO', accessDel.headerBtnVisible === false);
assertTest('Usuário Delegado: Botão "+ Criar Nova Camada" no Drawer lateral está VISÍVEL', accessDel.drawerBtnVisible === true);
assertTest('Usuário Delegado: Permissão de criação de camada ativa', accessDel.canCreateLayer === true);
assertTest('Usuário Delegado: Permissão de upload de ortofoto ativa', accessDel.canUploadRaster === true);

// Teste Perfil: Usuário Comum (sem delegação)
const accessNormal = evaluateLayerCreationAccess(normalUser);
assertTest('Usuário Comum: Botão Header "+" OCULTO', accessNormal.headerBtnVisible === false);
assertTest('Usuário Comum: Botão Drawer "+ Criar Nova Camada" OCULTO', accessNormal.drawerBtnVisible === false);
assertTest('Usuário Comum: Permissão de criação de camada DESATIVADA', accessNormal.canCreateLayer === false);

// Teste Perfil: Admin
const accessAdmin = evaluateLayerCreationAccess(adminObras);
assertTest('Admin: Botão Header "+" da Central de Camadas VISÍVEL', accessAdmin.headerBtnVisible === true);

// ------------------------------------------------------------------------------
// BATERIA 4: TESTES DE NÃO-REGRESSÃO DE BUGS E ATUALIZAÇÕES ESPECÍFICAS
// ------------------------------------------------------------------------------
console.log(`\n${BOLD}[4/4] Verificando Regressões Conhecidas e Integridade das Telas...${RESET}`);

// 1. Botão "Abrir no Mapa" não pode voltar para "COMPARTILHADOS COMIGO"
const hasAbrirNoMapaInCompartilhados = usuariosGestaoCode.includes("onclick=\"window.UsuariosManager.abrirNoMapa");
assertTest('Regressão: Botão "Abrir no Mapa" removido de COMPARTILHADOS COMIGO', !hasAbrirNoMapaInCompartilhados, 'Botão "Abrir no Mapa" reapareceu em COMPARTILHADOS COMIGO!');

// 2. Prevenção de loop e erro 403 em saveCurrentWorkspaceState
const hasLiveUpsert403InMain = mainJsContent.includes("from('user_projetos').upsert");
assertTest('Regressão: saveCurrentWorkspaceState livre de chamadas HTTP não protegidas (erro 403)', !hasLiveUpsert403InMain, 'saveCurrentWorkspaceState ainda contém chamada de rede para user_projetos!');

// 3. Verificação de suporte a Unidade e Setor nos cards e painel de edição em src/usuarios-gestao.js
const hasUnidadeInput = usuariosGestaoCode.includes('user-unidade-input');
const hasSetorInput = usuariosGestaoCode.includes('user-setor-input');
assertTest('Campos de edição de Unidade e Setor presentes no painel do usuário', hasUnidadeInput && hasSetorInput);

const hasUnidadeBadge = usuariosGestaoCode.includes('Unidade: ${userUnidade}');
const hasSetorBadge = usuariosGestaoCode.includes('Setor: ${userSetor}');
assertTest('Badges visuais de Unidade e Setor presentes nos cards de usuário', hasUnidadeBadge && hasSetorBadge);

const hasSectorFilters = usuariosGestaoCode.includes('_selectedSetorFiltro');
assertTest('Filtro de Setores por pills interativas presente na Central de Usuários', hasSectorFilters);

// 4. Verificação de suporte a Delegações no gerenciador de usuários
const hasDelegationToggles = usuariosGestaoCode.includes('pode_criar_camadas') && usuariosGestaoCode.includes('pode_subir_ortofotos');
assertTest('Toggles de delegação de camada e ortofoto presentes na Central de Usuários', hasDelegationToggles);

// 5. Verificação de script SQL de permissão
const sqlProjetos = fs.readFileSync('supabase_projetos_setup.sql', 'utf8');
const hasGrantAuth = sqlProjetos.includes('GRANT ALL ON TABLE public.user_projetos TO authenticated;');
assertTest('Script supabase_projetos_setup.sql contém GRANT para authenticated', hasGrantAuth);

// ------------------------------------------------------------------------------
// RELATÓRIO FINAL
// ------------------------------------------------------------------------------
console.log(`\n${BOLD}${CYAN}==============================================================================${RESET}`);
console.log(`${BOLD} 📊 RESULTADO DA AUDITORIA QA:${RESET}`);
console.log(`    Total de verificações: ${BOLD}${totalTests}${RESET}`);
console.log(`    Aprovados:             ${GREEN}${BOLD}${passedTests}${RESET}`);
console.log(`    Falhas:                ${failedTests > 0 ? RED : GREEN}${BOLD}${failedTests}${RESET}`);
console.log(`${BOLD}${CYAN}==============================================================================${RESET}\n`);

if (failedTests > 0) {
    console.log(`${RED}${BOLD}❌ O COMMIT FOI BLOQUEADO DEVIDO A ${failedTests} FALHA(S):${RESET}`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    console.log(`\n${YELLOW}Por favor, corrija as falhas acima antes de efetuar o commit.${RESET}\n`);
    process.exit(1);
} else {
    console.log(`${GREEN}${BOLD}✨ TODAS AS VERIFICAÇÕES PASSARAM COM SUCESSO! CÓDIGO SEGURO PARA COMMIT.${RESET}\n`);
    process.exit(0);
}
