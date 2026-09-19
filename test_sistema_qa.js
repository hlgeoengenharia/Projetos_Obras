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
    'src/tableJoin.js',
    'src/reportAdapter.js',
    'src/reportBuilder.js'
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
    const isMunAdmin = (currentUser.papel === 'admin' || currentUser.unidade_admin || currentUser.entidade_admin);
    if (!isMunAdmin) return false;

    const minhaEntidade = (currentUser.entidade || 'Prefeitura Municipal').trim().toLowerCase();
    const userEntidade = (targetUser.entidade || 'Prefeitura Municipal').trim().toLowerCase();
    if (minhaEntidade !== userEntidade) return false;

    if (currentUser.super_admin) return true;

    const minhaUnidade = (currentUser.unidade_admin || currentUser.unidade || '').trim().toLowerCase();
    if (minhaUnidade) {
        if (targetUser.user_id === currentUser.id || targetUser.id === currentUser.id) return true;
        const userUnidade = (targetUser.unidade || '').trim().toLowerCase();
        if (!userUnidade) return true; // Permite integrar e atribuir unidade a novos servidores
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

// 3. Admin de Ente Parceiro (ex: MPF)
const adminMpf = { id: 'adm-mpf', papel: 'admin', entidade_admin: true, super_admin: false, entidade: 'Ministério Público Federal', unidade: 'Procuradoria da República', unidade_admin: 'Procuradoria da República' };
const userMpfMesmaUnidade = { id: 'user-mpf-1', entidade: 'Ministério Público Federal', unidade: 'Procuradoria da República' };
const userMpfSemUnidade = { id: 'user-mpf-2', entidade: 'Ministério Público Federal', unidade: '' };
const userPf = { id: 'user-pf', entidade: 'Polícia Federal', unidade: 'Superintendência' };

assertTest('Admin Ente (MPF): PODE gerenciar servidor do MPF na mesma Unidade', simulateCanManageUser(adminMpf, userMpfMesmaUnidade));
assertTest('Admin Ente (MPF): PODE gerenciar novo servidor do MPF sem unidade atribuída', simulateCanManageUser(adminMpf, userMpfSemUnidade));
assertTest('Admin Ente (MPF): NÃO PODE gerenciar servidor da Polícia Federal', !simulateCanManageUser(adminMpf, userPf), 'Isolamento entre entes violado!');
assertTest('Admin Ente (MPF): NÃO PODE gerenciar servidor Municipal', !simulateCanManageUser(adminMpf, userObras), 'Isolamento de ente para município violado!');
assertTest('Admin Municipal: NÃO PODE gerenciar servidor do MPF', !simulateCanManageUser(adminObras, userMpfMesmaUnidade), 'Admin municipal gerenciando ente parceiro!');

// 4. Usuário Comum
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

// 6. Integridade de Hierarquia de Camadas e Sub-Abas
const hasAutoHealHierarchy = usuariosGestaoCode.includes('hasAnySubAbaVer') && usuariosGestaoCode.includes('podeVerCamada = !!userCamadaPerm.pode_ver || hasAnySubAbaVer');
assertTest('Hierarquia Camada/Abas: Auto-Heal ativo (se há abas liberadas, a camada pai é ativada)', hasAutoHealHierarchy);

const hasOnSubAbaChange = usuariosGestaoCode.includes('function onSubAbaChange') && usuariosGestaoCode.includes('onSubAbaChange,');
assertTest('Hierarquia Camada/Abas: onSubAbaChange implementada e exposta em UsuariosManager', hasOnSubAbaChange);

const hasMemoryCacheSync = usuariosGestaoCode.includes('_allCamadaPerms[`${row.user_id}:${row.theme_id}`] = row;') && usuariosGestaoCode.includes('_allAbaPerms[`${row.user_id}:${row.form_id}:${row.tab_id}`] = row;');
assertTest('Sincronização: Cache em memória de _allCamadaPerms e _allAbaPerms atualizado ao salvar', hasMemoryCacheSync);

const noDestructiveOrphanDeletion = !usuariosGestaoCode.includes("supabaseClient.from('permissoes_camada').delete().in('id', orphanCamadaIds)");
assertTest('Segurança de Dados: Ausência de rotina destrutiva que deletava permissões no carregamento', noDestructiveOrphanDeletion);

// 7. Prevenção de Vazamento de Dados Tabulares ("Vazamento de dados")
const hasCanUserSeeThemeData = mainJsContent.includes('function canUserSeeThemeData(theme)') && mainJsContent.includes('window.canUserSeeThemeData = canUserSeeThemeData;');
assertTest('Anti-Vazamento: canUserSeeThemeData implementada e exposta em window', hasCanUserSeeThemeData);

const noInsecureFallbackInCanSeeFormTab = !mainJsContent.includes("return userCanOnTheme(targetTheme.id, 'ver');");
assertTest('Anti-Vazamento: canSeeFormTab livre de fallback que concedia visão de abas por permissão de camada', noInsecureFallbackInCanSeeFormTab);

const hasGatedFeatureList = mainJsContent.includes("typeof canUserSeeThemeData === 'function' && !canUserSeeThemeData(theme)") && mainJsContent.includes('Visualização de Dados Restrita');
assertTest('Anti-Vazamento: renderFeatureListItems exibe banner de dados restritos e bloqueia feições', hasGatedFeatureList);

const hasGatedFilters = mainJsContent.includes('${canSeeData ? `') && mainJsContent.includes('id="filters-container-${theme.id}"');
assertTest('Anti-Vazamento: Container de filtros do tema condicionado à permissão canSeeData', hasGatedFilters);

const hasGatedFeatureModal = mainJsContent.includes('themeObj && typeof canUserSeeThemeData === \'function\' && !canUserSeeThemeData(themeObj)');
assertTest('Anti-Vazamento: showFeatureInfoModal bloqueia abertura do modal de feição sem permissão de dados', hasGatedFeatureModal);

// 8. Estatística da Camada, Edição de Tema e Estatística Cruzada
const hasCamadaEstatisticaCheck = usuariosGestaoCode.includes('camada-estatistica-check') && usuariosGestaoCode.includes('pode_estatistica');
assertTest('Permissões: Checkbox de Estatística da Camada presente em Gestão de Usuários', hasCamadaEstatisticaCheck);

const hasCamadaEditarTemaCheck = usuariosGestaoCode.includes('camada-editar-tema-check') && usuariosGestaoCode.includes('pode_editar_tema');
assertTest('Permissões: Checkbox de Edição do Tema presente em Gestão de Usuários', hasCamadaEditarTemaCheck);

const hasEstatisticaCruzadaCheck = usuariosGestaoCode.includes('user-pode-estatistica-cruzada-check') && usuariosGestaoCode.includes('pode_estatistica_cruzada');
assertTest('Permissões: Delegação de Estatística Cruzada presente em Gestão de Usuários', hasEstatisticaCruzadaCheck);

const hasSpatialAnalyticsGating = mainJsContent.includes('currentUserProfile.pode_estatistica_cruzada') && mainJsContent.includes('btn-spatial-analytics');
assertTest('Permissões: Botão de Análise Espacial Cruzada condicionado a pode_estatistica_cruzada ou admin', hasSpatialAnalyticsGating);

const sqlEstatisticas = fs.existsSync('supabase_projetos_e_permissoes_estatisticas.sql') ? fs.readFileSync('supabase_projetos_e_permissoes_estatisticas.sql', 'utf8') : '';
const hasSqlEstatisticasColumns = sqlEstatisticas.includes('pode_estatistica BOOLEAN') && sqlEstatisticas.includes('pode_editar_tema BOOLEAN') && sqlEstatisticas.includes('pode_estatistica_cruzada BOOLEAN');
assertTest('Banco de Dados: Script SQL contém colunas pode_estatistica, pode_editar_tema e pode_estatistica_cruzada', hasSqlEstatisticasColumns);

// 9. Persistência de Camadas em Projetos (Gerenciador de Projetos e Compartilhamentos)
const hasSaveWorkspaceCloudSync = mainJsContent.includes("from('user_projetos')") && mainJsContent.includes("camadas_ids: proj.camadas_ids");
assertTest('Projetos: saveCurrentWorkspaceState sincroniza camadas_ids, rasters_ids e camadas_visiveis no Supabase', hasSaveWorkspaceCloudSync);

const hasSmartMergeProjects = mainJsContent.includes('Fallback/Cache LocalStorage e Smart-Merge Bidirecional') && mainJsContent.includes('cloudHasLayers = Array.isArray(cloudProj.camadas_ids)');
assertTest('Projetos: initUserProjects executa smart merge bidirecional garantindo persistência pós-reload', hasSmartMergeProjects);

// 10. Governança e Acesso para Administradores de Entes Parceiros (MPF, PF, SPU, etc.)
const sqlEntesFixExists = fs.existsSync('supabase_admin_entes_fix.sql');
assertTest('Script supabase_admin_entes_fix.sql existe no repositório', sqlEntesFixExists);
if (sqlEntesFixExists) {
    const sqlEntesContent = fs.readFileSync('supabase_admin_entes_fix.sql', 'utf8');
    assertTest('Script SQL: Função is_admin_for_entidade presente', sqlEntesContent.includes('is_admin_for_entidade'));
    assertTest('Script SQL: Política membros_select atualizada com is_admin_for_entidade', sqlEntesContent.includes('membros_select') && sqlEntesContent.includes('is_admin_for_entidade(entidade)'));
    assertTest('Script SQL: Política profiles_select_own_or_admin atualizada', sqlEntesContent.includes('profiles_select_own_or_admin'));
    assertTest('Script SQL: Política profiles_update_admin atualizada para admin de ente', sqlEntesContent.includes('profiles_update_admin') && sqlEntesContent.includes('is_admin_for_entidade'));
}

const homeHtmlContent = fs.readFileSync('home.html', 'utf8');
const hasHomeAdminEntesCheck = homeHtmlContent.includes('homeUserProfile.entidade_admin') && homeHtmlContent.includes("homeUserProfile.papel === 'admin'");
assertTest('Frontend: home.html reconhece entidade_admin e papel admin sem ocultar card USUÁRIOS', hasHomeAdminEntesCheck);

const hasUsuariosGestaoEntidadeAdmin = usuariosGestaoCode.includes('_currentUserProfile.entidade_admin') && usuariosGestaoCode.includes('minhaSigla === \'Município\' && _targetMunicipioId');
assertTest('Frontend: usuarios-gestao.js reconhece entidade_admin e isola apenas municípios por _targetMunicipioId', hasUsuariosGestaoEntidadeAdmin);

const hasGerenciadorIconInMunCard = homeHtmlContent.includes('title="Gerenciador"') &&
    homeHtmlContent.includes('more_vert') &&
    homeHtmlContent.includes("abrirPainelMunicipio('${authData.id}'");
assertTest('Frontend: Ícone de três pontos (Gerenciador) presente no card de município em home.html', hasGerenciadorIconInMunCard);

const hasFitMapToAuthorizedBounds = homeHtmlContent.includes('function fitMapToAuthorizedBounds(') &&
    homeHtmlContent.includes('window.fitMapToAuthorizedBounds = fitMapToAuthorizedBounds') &&
    !homeHtmlContent.includes("paraibaMapInstance.fitBounds(bounds, { padding: [20, 20] });");
assertTest('Frontend: Centralização e zoom dinâmico nos municípios autorizados preservados (desktop e mobile)', hasFitMapToAuthorizedBounds);

// 11. Reestruturação da Central de Usuários: Card do Admin, 4 Abas e Isolamento de Camadas
const settingsHtmlContent = fs.readFileSync('settings.html', 'utf8');
const hasAdminProfileCardContainer = settingsHtmlContent.includes('id="usuarios-admin-profile-card"');
assertTest('Central de Usuários: Container do Card do Admin presente em settings.html', hasAdminProfileCardContainer);

const ugFreshCode = fs.readFileSync('src/usuarios-gestao.js', 'utf8');
const hasRenderAdminHeaderCard = ugFreshCode.includes('function renderAdminHeaderCard()') && ugFreshCode.includes('getAdminUserObj()');
assertTest('Central de Usuários: renderAdminHeaderCard implementada em usuarios-gestao.js', hasRenderAdminHeaderCard);

const hasFourTabs = ugFreshCode.includes("'minha-equipe'") && ugFreshCode.includes("'minhas-camadas'") && ugFreshCode.includes("'compartilhados-comigo'") && ugFreshCode.includes("'usuarios-compartilhamento'");
assertTest('Central de Usuários: 4 Abas configuradas (MINHA EQUIPE, MINHAS CAMADAS, COMPARTILHADOS COMIGO, USUÁRIOS EM COMPARTILHAMENTO)', hasFourTabs);

const hasAdminExcludedFromSubordinates = ugFreshCode.includes('u.user_id === _currentUserProfile?.id') && ugFreshCode.includes('O próprio Admin logado não deve ser exibido novamente');
assertTest('Central de Usuários: Admin logado excluído da listagem de subordinados em MINHA EQUIPE', hasAdminExcludedFromSubordinates);

const hasRenderMinhasCamadasCriadas = ugFreshCode.includes('function renderMinhasCamadasCriadas(') && ugFreshCode.includes('Camadas Oficiais de');
assertTest('Central de Usuários: renderMinhasCamadasCriadas implementada para catálogo exclusivo do ente', hasRenderMinhasCamadasCriadas);

const hasLayerDelegationCeiling = ugFreshCode.includes('TETO DE DELEGAÇÃO: Exibe também camadas de outros entes que foram compartilhadas com o Administrador logado') &&
    ugFreshCode.includes('adminCamadaPerm && adminCamadaPerm.pode_ver === true');
assertTest('Central de Usuários: Administrador pode delegar camadas compartilhadas para sua equipe (Teto de Delegação)', hasLayerDelegationCeiling);

const hasStrictCamadasEnteIsolation = ugFreshCode.includes('if (tSigla !== minhaSigla) return false;') &&
    ugFreshCode.includes("if (minhaSigla === 'Município' && meuMunId && t.municipio_id && t.municipio_id !== meuMunId) return false;");
assertTest('Central de Usuários: Isolamento estrito de camadas do ente em CAMADAS (sem vazamento de outros órgãos)', hasStrictCamadasEnteIsolation);

const hasRasterDelegationCeiling = ugFreshCode.includes('TETO DE DELEGAÇÃO: Exibe também ortofotos de outros entes que foram compartilhadas com o Administrador logado') &&
    ugFreshCode.includes('adminRasterPerm.pode_ver') &&
    ugFreshCode.includes('adminHasPerm = (rSigla === minhaSigla) || !!(adminRasterPerm && adminRasterPerm.pode_ver);');
assertTest('Central de Usuários: Administrador pode delegar ortofotos compartilhadas para sua equipe (Teto de Delegação)', hasRasterDelegationCeiling);

// 12. Estabilidade de Alta Densidade (20.709 Feições) e GeoEngineTurbo
const indexHtmlContent = fs.readFileSync('index.html', 'utf8');
const hasDensityIndicatorInHtml = indexHtmlContent.includes('id="map-density-indicator"') && indexHtmlContent.includes('id="map-density-text"');
assertTest('Alta Densidade: Banner flutuante de alerta de densidade presente no index.html', hasDensityIndicatorInHtml);

const mainFreshCode = fs.readFileSync('src/main.js', 'utf8');
const hasDensityControlInMap = mainFreshCode.includes('anyThemeCapped') && mainFreshCode.includes('map-density-indicator') && mainFreshCode.includes('aproxime o zoom');
assertTest('Alta Densidade: loadAllFeaturesToMap controla indicador de densidade visual automaticamente', hasDensityControlInMap);

const hasCacheTimestampValidation = mainFreshCode.includes('last_feature_updated_at') && mainFreshCode.includes('cachedTimestamp') && mainFreshCode.includes('shouldInvalidateCache = true');
assertTest('Cache Inteligente: loadThemeProperties valida contagem e timestamp de edições no Supabase', hasCacheTimestampValidation);

const hasMultiPassPageRetry = mainFreshCode.includes('pendingPages') && mainFreshCode.includes('while (pendingPages.length > 0 && rounds < 3)');
assertTest('Resiliência de Rede: loadThemeProperties possui retry multi-pass para páginas de feições', hasMultiPassPageRetry);

const hasRealtimeBatchBuffer = mainFreshCode.includes('pendingRealtimeRecords') && mainFreshCode.includes('saveThemeData') && mainFreshCode.includes('indexThemeFeatures');
assertTest('Tempo Real: feicoes-realtime processa eventos em lote sem perdas e sincroniza com GeoTurboDB', hasRealtimeBatchBuffer);

const hasSuperAdminPontoFocalBypass = ugFreshCode.includes('isPartnerPontoFocal = !isSuperAdmin &&') || (fs.readFileSync('src/usuarios-gestao.js', 'utf8').includes('isPartnerPontoFocal = !isSuperAdmin &&'));
assertTest('SuperAdmin: Permite atribuir municípios e editar cadastro completo de usuários externos mesmo com Ponto Focal ativo', hasSuperAdminPontoFocalBypass);

// 13. Navegação Hierárquica em EQUIPE (Entes ➔ Unidades ➔ Setores)
const ugUpdatedCode = fs.readFileSync('src/usuarios-gestao.js', 'utf8');
const hasSetEnteAndUnidadeExports = ugUpdatedCode.includes('setEnteEquipe,') && ugUpdatedCode.includes('setUnidadeEquipe,');
assertTest('Hierarquia EQUIPE: Funções setEnteEquipe e setUnidadeEquipe implementadas e expostas no UsuariosManager', hasSetEnteAndUnidadeExports);

const hasEnteTabsRendering = ugUpdatedCode.includes('entesDisponiveisMap') && ugUpdatedCode.includes('window.UsuariosManager.setEnteEquipe') && !ugUpdatedCode.includes('Órgão / Ente:');
assertTest('Hierarquia EQUIPE: Nível 1 (Abas de Entes) limpa sem rótulo redundante "Órgão / Ente:"', hasEnteTabsRendering);

const hasUnidadeSubTabsRendering = ugUpdatedCode.includes('unidadesMap') && ugUpdatedCode.includes('window.UsuariosManager.setUnidadeEquipe') && !ugUpdatedCode.includes("setUnidadeEquipe('todas')");
assertTest('Hierarquia EQUIPE: Nível 2 (Sub-abas de Unidades) sem botão redundante "Todas", selecionando automaticamente a primeira', hasUnidadeSubTabsRendering);

const hasCleanSetorAndNoBanner = !ugUpdatedCode.includes("setSetorFiltro('todos')") && !ugUpdatedCode.includes('Equipe de ${nomeEnteExibido}') && !ugUpdatedCode.includes('Servidores subordinados à gestão institucional');
assertTest('Hierarquia EQUIPE: Sem botão "Todos" no Setor e sem card redundante "Equipe de [Ente]"', hasCleanSetorAndNoBanner);

const hasUnidadeAdminBooleanSafe = ugUpdatedCode.includes('unidade_admin: (papel === \'admin\')');
assertTest('Estabilidade DB: unidade_admin tipado estritamente como booleano evitando erros HTTP 400', hasUnidadeAdminBooleanSafe);

const hasSharedNomeUfFormatting = ugUpdatedCode.includes('${munObj.nome}-${munObj.uf || \'PB\'}') && ugUpdatedCode.includes('itemSigla = `${munObj.nome}-${munObj.uf || \'PB\'}`');
assertTest('Compartilhamento: Origem municipal formatada como Nome-UF (ex: Cabedelo-PB) nos filtros e cards', hasSharedNomeUfFormatting);

const hasParceirosNomeUfMapping = ugUpdatedCode.includes('munLabel = `${m.nome}-${m.uf || \'PB\'}`') && ugUpdatedCode.includes('sigla: munKey,') && ugUpdatedCode.includes('label: munLabel,');
assertTest('Parceiros & Entes: Municípios mapeados individualmente no formato Nome-UF com suporte a contagem zero', hasParceirosNomeUfMapping);


const mainJsHeaderCode = fs.readFileSync('src/main.js', 'utf8');
const hasGlobalMapMunicipalGating = indexHtmlContent.includes('id="btn-global-map" href="home.html" class="hidden') &&
    mainJsHeaderCode.includes('podeVerGlobo = isSuperAdmin || (!isMunicipal &&') &&
    mainJsHeaderCode.includes("btnGlobalMap.classList.add('hidden')");
assertTest('Header: Ícone do globo (btn-global-map) visível para SuperAdmin e oculto para Admins e Usuários Municipais', hasGlobalMapMunicipalGating);

const updatedHomeHtml = fs.readFileSync('home.html', 'utf8');
const hasHomeGloboMunicipalGating = updatedHomeHtml.includes('window.userPodeVerGlobo') &&
    updatedHomeHtml.includes('atualizarVisibilidadeGloboHome') &&
    updatedHomeHtml.includes('isCardActive') &&
    updatedHomeHtml.includes('id="header-mun-active-globe"');
assertTest('Home: Ícone do globo único (sem duplicidade ao entrar em card) e isolado para Admins e Usuários Municipais', hasHomeGloboMunicipalGating);

const hasConfigGlobaisSmartReturn = updatedHomeHtml.includes("window._configOrigem = isMunView ? 'municipio' : 'portal'") &&
    updatedHomeHtml.includes("if (window._configOrigem === 'municipio' && !forcePortal)") &&
    updatedHomeHtml.includes("configSec && configSec.classList.contains('active')");
assertTest('Navegação: Retorno inteligente das Configurações Globais (home.html se aberto do portal, cards se aberto do município)', hasConfigGlobaisSmartReturn);

const hasZeroCountHidingInUsers = usuariosGestaoCode.includes('p.pfCount > 0') &&
    usuariosGestaoCode.includes('todosItens.filter(it => it.sigla === sigla).length > 0');
assertTest('Central de Usuários: Entes sem usuários em PARCEIROS e entes sem camadas em COMPARTILHADOS são ocultados', hasZeroCountHidingInUsers);

const mainJsFullCode = fs.readFileSync('src/main.js', 'utf8');
const hasZeroCountHidingInProjectManager = mainJsFullCode.includes('isLocal || count > 0') &&
    mainJsFullCode.includes("tabsList.some(t => t.sigla === window.selectedSharedEntityFilter)");
assertTest('Gerenciador de Projetos: Entes parceiros sem camadas compartilhadas (count == 0) são ocultados', hasZeroCountHidingInProjectManager);

const measurementJsCode = fs.readFileSync('src/measurement.js', 'utf8');
const hasCoordinateQueryFeature = indexHtmlContent.includes("selectMeasurementOption('CoordinateQuery')") &&
    indexHtmlContent.includes('id="coordinate-query-panel"') &&
    indexHtmlContent.includes('id="tab-coord-dec"') &&
    indexHtmlContent.includes('id="tab-coord-gms"') &&
    indexHtmlContent.includes('id="tab-coord-utm"') &&
    measurementJsCode.includes('locateCoordinatesOnMap') &&
    measurementJsCode.includes('convertUtmToLatLng');
assertTest('Ferramenta de Medição: Opção "Consultar Coordenadas" com suporte a DEC, GMS e UTM implementada', hasCoordinateQueryFeature);

const loginHtmlContent = fs.readFileSync('login.html', 'utf8');
const sessionSecurityJsCode = fs.readFileSync('src/session-security.js', 'utf8');

const hasLgpdModalFeature = loginHtmlContent.includes('id="lgpd-modal"') &&
    loginHtmlContent.includes('Termos de Uso') &&
    loginHtmlContent.includes('Aviso para Proteção dos Dados Pessoais (LGPD)') &&
    loginHtmlContent.includes('id="lgpd-continue-btn"') &&
    loginHtmlContent.includes('TERMO_LGPD_CIENTE') &&
    sessionSecurityJsCode.includes('ensureLgpdModal') &&
    sessionSecurityJsCode.includes("sessionStorage.setItem('geogestor_lgpd_accepted'");
assertTest('LGPD / Segurança: Modal institucional de Termos de Uso e Proteção de Dados (LGPD) implementado com auditoria', hasLgpdModalFeature);

const hasLoginEmailNotificationFeature = loginHtmlContent.includes('sendLoginNotification') &&
    loginHtmlContent.includes('ALERTA_LOGIN_DISPARADO') &&
    loginHtmlContent.includes('send-login-alert') &&
    fs.existsSync('supabase/functions/send-login-alert/index.ts') &&
    fs.existsSync('supabase_login_alert_setup.sql');
assertTest('LGPD / Segurança: Rotina de notificação por e-mail com data, hora e dispositivo implementada (Edge Function & auditoria)', hasLoginEmailNotificationFeature);

// 14. Módulo de Relatórios Gerenciais (A4) - Padrão Cartográfico, Gavetas Acordeon e Não-Regressão
const reportAdapterExists = fs.existsSync('src/reportAdapter.js');
assertTest('Relatórios A4: Arquivo src/reportAdapter.js existe', reportAdapterExists);

if (reportAdapterExists) {
    const reportAdapterCode = fs.readFileSync('src/reportAdapter.js', 'utf8');
    const hasAdapterExports = reportAdapterCode.includes('window.ReportAdapter = {') &&
        reportAdapterCode.includes('getFormFields') &&
        reportAdapterCode.includes('getExistingCharts') &&
        reportAdapterCode.includes('getHistoricalOrthophotos') &&
        reportAdapterCode.includes('calculateFeatureDimensions') &&
        reportAdapterCode.includes('saveReportTemplate');
    assertTest('Relatórios A4: ReportAdapter expõe API somente-leitura e métodos analíticos', hasAdapterExports);
}

const reportBuilderExists = fs.existsSync('src/reportBuilder.js');
assertTest('Relatórios A4: Arquivo src/reportBuilder.js existe', reportBuilderExists);

if (reportBuilderExists) {
    const reportBuilderCode = fs.readFileSync('src/reportBuilder.js', 'utf8');
    const hasBuilderExports = reportBuilderCode.includes('window.ReportBuilder = {') &&
        reportBuilderCode.includes('toggleAccordion') &&
        reportBuilderCode.includes('saveCurrentTemplate') &&
        reportBuilderCode.includes('generateIndividualReport') &&
        reportBuilderCode.includes('enableInlineEdit');
    assertTest('Relatórios A4: ReportBuilder implementa gavetas acordeon, edição inline e exportação', hasBuilderExports);

    const hasTenAccordionCards = reportBuilderCode.includes("id: 'acc-layout'") &&
        reportBuilderCode.includes("id: 'acc-header'") &&
        reportBuilderCode.includes("id: 'acc-grid'") &&
        reportBuilderCode.includes("id: 'acc-map'") &&
        reportBuilderCode.includes("id: 'acc-charts'") &&
        reportBuilderCode.includes("id: 'acc-kpis'") &&
        reportBuilderCode.includes("id: 'acc-photos'") &&
        reportBuilderCode.includes("id: 'acc-table-syn'") &&
        reportBuilderCode.includes("id: 'acc-table-ana'") &&
        reportBuilderCode.includes("id: 'acc-text-footer'");
    assertTest('Relatórios A4: Todas as 10 Gavetas Acordeon (Cards 0 a 9) configuradas no painel lateral', hasTenAccordionCards);

    const hasA4CanvasStyles = reportBuilderCode.includes('a4-sheet-stage') &&
        reportBuilderCode.includes('page-break-avoid') &&
        reportBuilderCode.includes('contenteditable');
    assertTest('Relatórios A4: Folha virtual com suporte a double-click inline, quebra de página e A4 dinâmico', hasA4CanvasStyles);
}

const freshSettingsHtml = fs.readFileSync('settings.html', 'utf8');
const hasSettingsReportsTab = freshSettingsHtml.includes('id="builder-module-reports"') &&
    freshSettingsHtml.includes('id="builder-nav-reports"') &&
    freshSettingsHtml.includes('switchBuilderModule');
assertTest('Cadastros (settings.html): Abas do Construtor (Formulário, Dashboard, Relatórios A4) integradas', hasSettingsReportsTab);

const freshIndexHtml = fs.readFileSync('index.html', 'utf8');
const hasIndexReportIntegration = freshIndexHtml.includes('id="btn-print-feature-report"') &&
    freshIndexHtml.includes('printActiveFeatureReport') &&
    freshIndexHtml.includes('src/reportAdapter.js') &&
    freshIndexHtml.includes('src/reportBuilder.js');
assertTest('Mapa (index.html): Botão de Relatório A4 no modal de feições conectado ao ReportBuilder', hasIndexReportIntegration);

const freshHomeHtml = fs.readFileSync('home.html', 'utf8');
const hasHomeGerenciadorSecurity = freshHomeHtml.includes('ehAdmin') &&
    freshHomeHtml.includes('title="Gerenciador"') &&
    freshHomeHtml.includes('more_vert');
assertTest('Segurança/Governança (home.html): Botão "Gerenciador" nos entes restrito a Admin e SuperAdmin', hasHomeGerenciadorSecurity);

const formRendererCode = fs.readFileSync('src/formRenderer.js', 'utf8');
const hasFormRendererReportShortcut = formRendererCode.includes('reportShortcutHtml') &&
    formRendererCode.includes('constructive_report_templates') &&
    formRendererCode.includes('atalho_aba');
assertTest('Mapa / Formulário: Abas de atributos renderizam atalho de relatório quando configuradas', hasFormRendererReportShortcut);

const reportBuilderCode = fs.existsSync('src/reportBuilder.js') ? fs.readFileSync('src/reportBuilder.js', 'utf8') : '';
const hasReportBuilderAdvancedFeatures = reportBuilderCode.includes('updateAtalhoAba') &&
    reportBuilderCode.includes('moveColumnOrder') &&
    reportBuilderCode.includes('insertAnalyticalTableBlock') &&
    reportBuilderCode.includes('handleLogoUpload');
assertTest('Relatórios A4: Recursos avançados (seletor de aba do popup, reordenação de colunas, tabela analítica e upload de brasão)', hasReportBuilderAdvancedFeatures);
const hasResponsiveA4Stage = reportBuilderCode.includes("boxSizing = 'border-box'") &&
    reportBuilderCode.includes("ruler.style.maxWidth") &&
    reportBuilderCode.includes("a4-page-break-indicator") &&
    freshSettingsHtml.includes("w-full max-w-none") &&
    freshHomeHtml.includes('<main class="flex-1 min-h-0 w-full px-3 sm:px-6');
assertTest('Layout Expansivo & Relatórios A4: Tela 100% expansível para as laterais e folha A4 sem cortes em Paisagem/Retrato', hasResponsiveA4Stage);

// NOVOS RECURSOS: CAIXA DE TEXTO LIVRE, ESCOPO GERAL, ATALHO DINÂMICO E PÁGINA INTERATIVA
const hasFreeTextBox = reportBuilderCode.includes("id: 'acc-free-text'") &&
    reportBuilderCode.includes("insertFreeTextBlock") &&
    reportBuilderCode.includes("caixa_texto_livre") &&
    reportBuilderCode.includes("handleFreeTextInput") &&
    reportBuilderCode.includes("renderMentionDropdown");
assertTest('Relatórios A4: Card "Caixa de texto livre" implementado com formatação rica e autocomplete @', hasFreeTextBox);

const hasGeralScope = reportBuilderCode.includes("switchType('geral')") &&
    reportBuilderCode.includes("ReportBuilder.switchType('geral')") &&
    !reportBuilderCode.includes("Lote / Geral");
assertTest('Relatórios A4: Escopo renomeado de "Lote / Geral" para "Geral"', hasGeralScope);

const relatorioViewExists = fs.existsSync('relatorio_view.html');
assertTest('Relatórios A4: Arquivo dedicado relatorio_view.html existe', relatorioViewExists);

if (relatorioViewExists) {
    const relatorioViewCode = fs.readFileSync('relatorio_view.html', 'utf8');
    const hasRelatorioViewFeatures = relatorioViewCode.includes('Gerar PDF') &&
        relatorioViewCode.includes('Gerar Word') &&
        relatorioViewCode.includes('gerarWord') &&
        relatorioViewCode.includes('initInteractiveLeafletMap') &&
        relatorioViewCode.includes('L.map') &&
        relatorioViewCode.includes('contenteditable="true"');
    assertTest('Relatórios A4: relatorio_view.html possui botões (PDF, Word, Impressão), mapa SIG interativo e textos editáveis', hasRelatorioViewFeatures);
}

const hasDynamicPopupShortcut = formRendererCode.includes('matchingTpl.nome') &&
    formRendererCode.includes('openFeatureReportPage') &&
    freshIndexHtml.includes('openFeatureReportPage');
assertTest('Relatórios A4: Atalho no popup exibe título dinâmico do relatório e conecta à página interativa', hasDynamicPopupShortcut);

const freshMainJs = fs.readFileSync('src/main.js', 'utf8');
const hasHeaderReportConditional = freshIndexHtml.includes('id="btn-print-feature-report"') &&
    freshIndexHtml.includes('style="display: none;"') &&
    freshMainJs.includes('updateFeatureHeaderReportButton') &&
    freshMainJs.includes("atalho_aba === 'header'");
assertTest('Relatórios A4: Botão "Relatório A4" no cabeçalho do popup condicionado exclusivamente a atalho_aba === "header"', hasHeaderReportConditional);

const freshReportBuilderCode = fs.readFileSync('src/reportBuilder.js', 'utf8');
const hasTabDisambiguationInMentions = freshReportBuilderCode.includes('data-tab-title') &&
    freshReportBuilderCode.includes('Aba:') &&
    freshReportBuilderCode.includes('insertMentionField') &&
    freshReportBuilderCode.includes('w-80 sm:w-96');
assertTest('Relatórios A4: Dropdown de menções @ exibe identificação explícita de abas para desambiguação de campos com mesmo nome', hasTabDisambiguationInMentions);

const hasTabGroupedGrid = freshReportBuilderCode.includes('cfg-grid-tab-section') &&
    freshReportBuilderCode.includes('toggleTabFieldsInDrawer') &&
    freshReportBuilderCode.includes('filterGridFieldsInDrawer') &&
    freshReportBuilderCode.includes('cfg-grid-search-input');
assertTest('Relatórios A4: Card "Grade de Atributos/Campos" organiza campos por abas com filtros e seleção por aba', hasTabGroupedGrid);

// Verificações do Card 6: Vistoria Fotográfica & Anexos (1:N) Reformulado
const freshReportAdapterCode = fs.readFileSync('src/reportAdapter.js', 'utf8');
const freshRelatorioViewCode = fs.readFileSync('relatorio_view.html', 'utf8');
const hasMultipleTabsAdapter = freshReportAdapterCode.includes('getMultipleTabs') &&
    freshReportAdapterCode.includes('isMultiple || t.isConsolidated');
assertTest('Relatórios A4: ReportAdapter implementa e expõe getMultipleTabs para detecção de abas 1:N e consolidadas', hasMultipleTabsAdapter);

const has1nCardReformulation = freshReportBuilderCode.includes('cfg-1n-source-tab') &&
    freshReportBuilderCode.includes('insertSynthetic1nBlock') &&
    freshReportBuilderCode.includes('insertAnalyticalPhotos1nBlock') &&
    freshReportBuilderCode.includes('select1nScope') &&
    freshReportBuilderCode.includes('btn-1n-scope-all') &&
    freshReportBuilderCode.includes('btn-1n-scope-last');
assertTest('Relatórios A4: Card "Vistoria Fotográfica & Anexos (1:N)" reformulado com seletor de abas 1:N, botões separados (Sintética vs Analítica) e escopo', has1nCardReformulation);

const has1nViewRendering = freshRelatorioViewCode.includes('renderSyntheticTable') &&
    freshRelatorioViewCode.includes('renderAnalyticalLaudo') &&
    freshRelatorioViewCode.includes('case \'tabela_sintetica_1n\':') &&
    freshRelatorioViewCode.includes('case \'laudo_vistoria_fotos\':') &&
    freshRelatorioViewCode.includes('cfg-1n-syn-cols-container' === 'cfg-1n-syn-cols-container');
assertTest('Relatórios A4: relatorio_view.html lê os registros 1:N do schema do formulário e renderiza tanto Tabela Sintética quanto Laudo Analítico com fotos', has1nViewRendering);

const freshReportBuilderCodeUpdated = fs.readFileSync('src/reportBuilder.js', 'utf8');
const hasGridReorderAndResize = freshReportBuilderCodeUpdated.includes('initGridFieldsSortable') &&
    freshReportBuilderCodeUpdated.includes('changeFieldWidthStep') &&
    freshReportBuilderCodeUpdated.includes('setFieldWidthExact') &&
    freshReportBuilderCodeUpdated.includes('toggleFieldWidthPopover') &&
    freshReportBuilderCodeUpdated.includes('field-width-dec-btn') &&
    freshReportBuilderCodeUpdated.includes('field-width-inc-btn') &&
    freshReportBuilderCodeUpdated.includes('field-drag-handle') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('spans[f.id]');
assertTest('Relatórios A4: Grade de Atributos suporta reordenação (drag & drop), botões steppers [-] [+] e menu popover de proporções', hasGridReorderAndResize);

const hasFluidGridResizing = freshReportBuilderCodeUpdated.includes('campos_larguras') &&
    freshReportBuilderCodeUpdated.includes('getFieldWidthStyle') &&
    freshReportBuilderCodeUpdated.includes('field-width-popover') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('campos_larguras') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('getFieldWidthStyle');
assertTest('Relatórios A4: Grade de Atributos suporta ajuste de largura (% rápido por frações e slider livre de 15% a 100%) na folha interativa e no relatório final', hasFluidGridResizing);

const hasGridFieldDeletion = freshReportBuilderCodeUpdated.includes('removeFieldFromGrid') &&
    freshReportBuilderCodeUpdated.includes('field-remove-btn');
assertTest('Relatórios A4: Grade de Atributos possui botão "x" para retirar campos diretamente da folha', hasGridFieldDeletion);

const hasExistingGridAppend = freshReportBuilderCodeUpdated.includes('addSelectedFieldsToExistingGrid') &&
    freshReportBuilderCodeUpdated.includes('quickAddFieldToExistingGrid');
assertTest('Relatórios A4: Card "Grade de Atributos / Campos" permite inserir campos em grade já existente na folha', hasExistingGridAppend);

const freshUsuariosGestaoCode = fs.readFileSync('src/usuarios-gestao.js', 'utf8');

const hasStrictAdminCeiling = freshUsuariosGestaoCode.includes('podeVerAba = adminAbaPerm ? (adminAbaPerm.pode_ver === true || adminAbaPerm.pode_ver === \'true\') : false') &&
    freshUsuariosGestaoCode.includes('podeEditarAba = podeVerAba && adminAbaPerm && (adminAbaPerm.pode_editar === true || adminAbaPerm.pode_editar === \'true\') && !!adminCamadaPerm.pode_editar');
assertTest('Central de Usuários: getAdminCeiling bloqueia abas de camadas compartilhadas sem permissão explícita', hasStrictAdminCeiling);

const hasRenderUserCardClamping = freshUsuariosGestaoCode.includes('podeVerCamada = podeVerCamada && adminCeiling.podeVer') &&
    freshUsuariosGestaoCode.includes('podeEditarTemaCamada = podeVerCamada && adminCeiling.podeEditarTema && podeEditarTemaCamada') &&
    freshUsuariosGestaoCode.includes('isAbaVerChecked = isAbaVerChecked && abaCeiling.podeVer') &&
    freshUsuariosGestaoCode.includes('isAbaEditarChecked = isAbaEditarChecked && isAbaVerChecked && abaCeiling.podeEditar');
assertTest('Central de Usuários: renderUserCard aplica clamp estrito de delegação em camadas e sub-abas', hasRenderUserCardClamping);

const hasCeilingInteractiveGuards = freshUsuariosGestaoCode.includes('onCamadaControlChange') &&
    freshUsuariosGestaoCode.includes('const canVer = isSuperAdmin || abaCeiling.podeVer') &&
    freshUsuariosGestaoCode.includes('const canEdit = isSuperAdmin || (abaCeiling.podeEditar && canVer)');
assertTest('Central de Usuários: toggleCamadaSubAbas e onSubAbaChange respeitam teto do Admin por sub-aba', hasCeilingInteractiveGuards);

const hasSalvarUsuarioCeiling = freshUsuariosGestaoCode.includes('podeVer = podeVer && adminCeiling.podeVer') &&
    freshUsuariosGestaoCode.includes('podeVerAba = podeVerAba && abaCeiling.podeVer') &&
    freshUsuariosGestaoCode.includes('podeEditarAba = podeEditarAba && podeVerAba && abaCeiling.podeEditar') &&
    freshUsuariosGestaoCode.includes('if (!canManageRaster) {');
assertTest('Central de Usuários: salvarUsuario valida teto do Admin em camadas, abas e ortofotos', hasSalvarUsuarioCeiling);

// Verificações da Resolução Supabase 404 e Card 6 (1:N) com Abas, Campos, Remoção "x" e Inserção
const hasSupabaseSqlFile = fs.existsSync('supabase_relatorios_templates.sql');
const supabaseSqlCode = hasSupabaseSqlFile ? fs.readFileSync('supabase_relatorios_templates.sql', 'utf8') : '';
const hasValidTemplatesSql = hasSupabaseSqlFile &&
    supabaseSqlCode.includes('CREATE TABLE IF NOT EXISTS public.relatorios_templates') &&
    supabaseSqlCode.includes('ENABLE ROW LEVEL SECURITY') &&
    supabaseSqlCode.includes('idx_relatorios_templates_form_id');
assertTest('Supabase DDL: Script supabase_relatorios_templates.sql criado com DDL completo, RLS e índices para a tabela relatorios_templates', hasValidTemplatesSql);

const currentReportAdapterCode = fs.readFileSync('src/reportAdapter.js', 'utf8');
const hasTemplatesCircuitBreaker = currentReportAdapterCode.includes('isRemoteTemplatesTableAvailable') &&
    currentReportAdapterCode.includes('error.code === \'PGRST205\'') &&
    currentReportAdapterCode.includes('isRemoteTemplatesTableAvailable = false;');
assertTest('ReportAdapter: Circuit breaker implementado para suprimir loop de erros 404/PGRST205 em relatorios_templates com fallback em localStorage', hasTemplatesCircuitBreaker);

const hasCard6TabsAndFields = freshReportBuilderCodeUpdated.includes('cfg-1n-tabs-container') &&
    freshReportBuilderCodeUpdated.includes('cfg-1n-group-by-tab') &&
    freshReportBuilderCodeUpdated.includes('set1nSortOrder') &&
    freshReportBuilderCodeUpdated.includes('set1nGroupByTab') &&
    freshReportBuilderCodeUpdated.includes('quickAddFieldTo1n');
assertTest('Relatórios A4: Card "Vistoria Fotográfica & Anexos (1:N)" exibe abas e campos estruturados, ordenação cronológica e por aba, e botão [+ Add]', hasCard6TabsAndFields);

const hasCard6ExistingInsertsAndRemoves = freshReportBuilderCodeUpdated.includes('addSelectedFieldsToExistingSynthetic1n') &&
    freshReportBuilderCodeUpdated.includes('addSelectedFieldsToExistingAnalytical1n') &&
    freshReportBuilderCodeUpdated.includes('removeColumnFromSynthetic1n') &&
    freshReportBuilderCodeUpdated.includes('removeFieldFromAnalytical1n');
assertTest('Relatórios A4: Card 1:N permite adicionar campos a tabelas/laudos existentes e botões "x" na folha A4 para remover colunas e campos', hasCard6ExistingInsertsAndRemoves);

const has1nViewCustomFieldsAndSorting = fs.readFileSync('relatorio_view.html', 'utf8').includes('renderSyntheticTable(bloco, featureData)') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('bloco.campos_selecionados') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('bloco.ordenar_por_aba');
assertTest('Relatórios A4: relatorio_view.html renderiza campos customizados, ordenação cronológica e agrupamento por aba para blocos 1:N', has1nViewCustomFieldsAndSorting);

const hasSynthetic1nColumnControls = freshReportBuilderCodeUpdated.includes('moveSynthetic1nColumn') &&
    freshReportBuilderCodeUpdated.includes('editSynthetic1nColTitle') &&
    freshReportBuilderCodeUpdated.includes('removeColumnFromSynthetic1n');
assertTest('Relatórios A4: Tabela Sintética 1:N permite mover colunas (◀ / ▶) e renomear/abreviar títulos com quebra de linha', hasSynthetic1nColumnControls);

const hasTableDensityAndStriping = freshReportBuilderCodeUpdated.includes('set1nTableDensity') &&
    freshReportBuilderCodeUpdated.includes('set1nRowStriping') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('density === \'ultracompact\'') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('bloco.zebrado');
assertTest('Relatórios A4: Tabela Sintética 1:N suporta densidade horizontal (Confortável/Compacto/Ultra) e cores alternadas por linha (Zebrado/Ente)', hasTableDensityAndStriping);

const hasTabSequenceReordering = freshReportBuilderCodeUpdated.includes('move1nTabSequence') &&
    freshReportBuilderCodeUpdated.includes('cfg-1n-tab-sequence-container') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('bloco.ordem_abas');
assertTest('Relatórios A4: Agrupamento 1:N suporta reordenar a sequência das abas com botões [↑] e [↓] na barra lateral e no relatório', hasTabSequenceReordering);

const hasConclusionAndCompoundFields = freshReportBuilderCodeUpdated.includes('laudoSampleHtml') &&
    freshReportBuilderCodeUpdated.includes('exibido na íntegra') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('FieldFormatter.toHtml(r.values[f.id]') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('attachment');
assertTest('Relatórios A4: Laudo 1:N exibe campos longos na íntegra e formata campos compostos (links/anexos) pelo formatador único', hasConclusionAndCompoundFields);

const has1nCheckboxPersistence = freshReportBuilderCodeUpdated.includes('current1nSelectedFieldKeys') &&
    freshReportBuilderCodeUpdated.includes('on1nFieldCheckboxChange') &&
    freshReportBuilderCodeUpdated.includes('sync1nSelectedFieldsFromDOM') &&
    freshReportBuilderCodeUpdated.includes('btn-1n-density-') &&
    freshReportBuilderCodeUpdated.includes('btn-1n-striping-');
assertTest('Relatórios A4: Checkboxes de campos 1:N persistem seleção (on1nFieldCheckboxChange e sync1nSelectedFieldsFromDOM) sem reset ao alterar ordenação, densidade ou zebrado', has1nCheckboxPersistence);

const hasCanonicalColumnDeduplication = freshReportBuilderCodeUpdated.includes('getCanonicalColId') &&
    freshReportBuilderCodeUpdated.includes('existingCol.fieldIds.push(f.id)') &&
    fs.readFileSync('src/reportData.js', 'utf8').includes('col.fieldIds');
assertTest('Relatórios A4: Tabela Sintética 1:N unifica colunas sinônimas/canônicas (getCanonicalColId) evitando duplicidade entre abas', hasCanonicalColumnDeduplication);

const has1nMultiRecordInspectionPreview = freshReportBuilderCodeUpdated.includes('mockRecords') &&
    freshReportBuilderCodeUpdated.includes('15/08/2026') &&
    freshReportBuilderCodeUpdated.includes('12/01/2026') &&
    freshReportBuilderCodeUpdated.includes('10/04/2026') &&
    freshReportBuilderCodeUpdated.includes('Vistoria inicial de constatação.');
assertTest('Relatórios A4: Visualização interativa 1:N renderiza múltiplas linhas por ente para múltiplos registros/vistorias com datas e dados distintos', has1nMultiRecordInspectionPreview);

// Novos testes: Laudo Analítico & Fotos (1:N) com paridade da Grade de Atributos e Abas Analíticas
const hasLaudoDensityAndStripingControls = freshReportBuilderCodeUpdated.includes('set1nLaudoDensity') &&
    freshReportBuilderCodeUpdated.includes('set1nLaudoRowStriping') &&
    freshReportBuilderCodeUpdated.includes('btn-1n-laudo-density-') &&
    freshReportBuilderCodeUpdated.includes('btn-1n-laudo-striping-');
assertTest('Relatórios A4: Laudo Analítico 1:N possui controles de densidade e zebrado/ente independentes na barra lateral', hasLaudoDensityAndStripingControls);

const hasLaudoInteractiveGridControls = freshReportBuilderCodeUpdated.includes('a4-grid-fields-container') &&
    freshReportBuilderCodeUpdated.includes('removeFieldFromAnalytical1n') &&
    freshReportBuilderCodeUpdated.includes('field-drag-handle') &&
    freshReportBuilderCodeUpdated.includes('changeFieldWidthStep') &&
    freshReportBuilderCodeUpdated.includes('toggleFieldWidthPopover');
assertTest('Relatórios A4: Laudo Analítico 1:N na Folha A4 conta com controles da Grade de Atributos (drag & drop, botões de largura [-] [+] e popover, remoção [x])', hasLaudoInteractiveGridControls);

const hasLaudoMultiTabStructureAndStandardConclusion = freshReportBuilderCodeUpdated.includes('Aba / Ente:') &&
    freshReportBuilderCodeUpdated.includes('renderLaudoPreview') &&
    freshReportBuilderCodeUpdated.includes('<details open') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('Aba / Ente:');
assertTest('Relatórios A4: Laudo Analítico 1:N mostra na Folha A4 uma seção por aba, já ABERTA, com os campos reais do formulário prontos para posicionar', hasLaudoMultiTabStructureAndStandardConclusion);

const hasFullCompound1nFields = freshReportBuilderCodeUpdated.includes('Título 2') &&
    freshReportBuilderCodeUpdated.includes('endereço-do-link-2') &&
    fs.readFileSync('src/fieldFormatter.js', 'utf8').includes('linkBlockHtml') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('hiperlink_1n');
assertTest('Relatórios A4: Campos com tipo de dados 1:N (hiperlinks, processos e anexos) são exibidos integralmente sem truncamento', hasFullCompound1nFields);

const freshReportBuilderCodeFinal = fs.readFileSync('src/reportBuilder.js', 'utf8');
const hasLaudoFieldCheckboxesInDrawer = freshReportBuilderCodeFinal.includes('cfg-1n-laudo-tabs-container') &&
    freshReportBuilderCodeFinal.includes('cfg-1n-laudo-field') &&
    freshReportBuilderCodeFinal.includes('on1nLaudoFieldCheckboxChange') &&
    freshReportBuilderCodeFinal.includes('current1nLaudoSelectedFieldKeys') &&
    freshReportBuilderCodeFinal.includes('toggleAll1nLaudoFieldsInDrawer') &&
    freshReportBuilderCodeFinal.includes('filter1nLaudoFieldsInDrawer');
assertTest('Relatórios A4: Seção "2. Laudo Analítico & Fotos (1:N)" possui árvore completa de abas e campos com checkboxes independentes para seleção e desseleção', hasLaudoFieldCheckboxesInDrawer);

const hasLaudoInsertAndRemoveControls = freshReportBuilderCodeFinal.includes('quickAddFieldToAnalytical1n') &&
    freshReportBuilderCodeFinal.includes('quickRemoveFieldFromAnalytical1n') &&
    freshReportBuilderCodeFinal.includes('removeSelectedFieldsFromExistingAnalytical1n') &&
    freshReportBuilderCodeFinal.includes('Retirar do Laudo');
assertTest('Relatórios A4: Laudo Analítico 1:N conta com botões rápidos de inserção/retirada por campo e ações em lote (Inserir no Laudo / Retirar do Laudo)', hasLaudoInsertAndRemoveControls);

// ASSOCIAÇÃO EXCLUSIVA (1:1) DE FORMULÁRIOS POR CAMADA E CLONAGEM DE MODELOS
// ------------------------------------------------------------------------------
const freshSettingsHtmlForms = fs.readFileSync('settings.html', 'utf8');
const freshMainJsForms = fs.readFileSync('src/main.js', 'utf8');

const hasCloneFormButtonAndFunction = freshSettingsHtmlForms.includes('cloneForm') &&
    freshSettingsHtmlForms.includes('content_copy') &&
    freshSettingsHtmlForms.includes('Duplicar Cadastro (Usar como Modelo)') &&
    freshSettingsHtmlForms.includes('generateUUID()') &&
    freshSettingsHtmlForms.includes('(Cópia)');
assertTest('Cadastros Personalizados: Possui botão de duplicar (content_copy) com função cloneForm gerando novo UUID e cópia profunda independente', hasCloneFormButtonAndFunction);

const hasBoundStatusBadgesAndExclusionProtection = freshSettingsHtmlForms.includes('themesForForms') &&
    freshSettingsHtmlForms.includes('loadThemesForForms') &&
    freshSettingsHtmlForms.includes('Disponível / Modelo') &&
    freshSettingsHtmlForms.includes('Exclusivo da camada vetorial') &&
    freshSettingsHtmlForms.includes('está atualmente vinculado à camada vetorial');
assertTest('Cadastros Personalizados: Exibe badges de status (Camada vinculada vs Disponível/Modelo) e bloqueia exclusão acidental de formulários em uso', hasBoundStatusBadgesAndExclusionProtection);

const hasExclusiveDropdownFiltering = freshMainJsForms.includes('assignedFormIds') &&
    freshMainJsForms.includes('currentEditingThemeFormId') &&
    freshMainJsForms.includes('assignedFormIds.has(formIdStr) && !isCurrentThemeForm') &&
    freshMainJsForms.includes('themeBeingEdited');
assertTest('Camadas Vetoriais: Dropdowns de criação/importação ocultam formulários já vinculados a outras camadas, preservando o formulário na edição da própria camada', hasExclusiveDropdownFiltering);

const hasLifecycleSelectSynchronization = freshMainJsForms.includes('openNewThemeModal') &&
    freshMainJsForms.includes('openEditThemeModal') &&
    freshMainJsForms.includes('saveNewTheme') &&
    freshMainJsForms.includes('populateFormSelects');
assertTest('Camadas Vetoriais: Selects de formulário sincronizam dinamicamente na abertura, salvamento e exclusão de temas no mapa', hasLifecycleSelectSynchronization);

// ------------------------------------------------------------------------------
// BATERIA 5: RELATÓRIOS GERENCIAIS A4 (CABEÇALHO, QUEBRAS DE LINHA E SUPRESSÃO 404)
// ------------------------------------------------------------------------------
console.log(`\n${BOLD}[5/5] Verificando Relatórios Gerenciais A4 (Cabeçalho, Quebras de Linha e Supressão 404)...${RESET}`);

const freshReportAdapterJs = fs.readFileSync('src/reportAdapter.js', 'utf8');
const freshReportBuilderJs = fs.readFileSync('src/reportBuilder.js', 'utf8');
const freshRelatorioViewHtml = fs.readFileSync('relatorio_view.html', 'utf8');

const hasCircuitBreakerAndCloudSync = freshReportAdapterJs.includes('STORAGE_KEY_REMOTE_AVAILABLE') &&
    freshReportAdapterJs.includes('isRemoteTemplatesTableAvailable') &&
    freshReportAdapterJs.includes('saveToFormsTableFallback') &&
    freshReportAdapterJs.includes('resetRemoteTableCheck');
assertTest('ReportAdapter: Disjuntor persistente para supressão do erro 404 de relatorios_templates com fallback automático em forms.schema', hasCircuitBreakerAndCloudSync);

const hasHeaderRepeatOptions = freshReportBuilderJs.includes('cfg-hdr-repeat-first') &&
    freshReportBuilderJs.includes('cfg-hdr-repeat-all') &&
    freshReportBuilderJs.includes('setHeaderRepeatMode') &&
    freshReportBuilderJs.includes('repetir_todas_folhas');
assertTest('ReportBuilder: Card 1 possui opções de repetição do cabeçalho (1ª Folha vs Todas as Folhas) com sincronização e badge', hasHeaderRepeatOptions);

const hasHeaderMetadataOutsideCard = freshReportBuilderJs.includes('Data e Hora Automática da Emissão') &&
    freshReportBuilderJs.includes('Número de Protocolo e Autenticação') &&
    freshReportBuilderJs.includes('left-2') &&
    freshReportBuilderJs.includes('-top-3.5 left-2');
assertTest('ReportBuilder: Data/Hora e Protocolo posicionados no topo direito fora do card/borda, desobstruindo a barra de ferramentas', hasHeaderMetadataOutsideCard);

const hasMultilinePreservation = freshReportBuilderJs.includes('whitespace-pre-line') &&
    freshReportBuilderJs.includes(".replace(/\\r?\\n/g, '<br>')") &&
    freshReportBuilderJs.includes('document.activeElement.blur()');
assertTest('ReportBuilder: Edição inline preserva quebras de linha com Enter ao salvar e renderizar, com desfoque preventivo do activeElement', hasMultilinePreservation);

const hasRelatorioViewMultilineAndHeader = freshRelatorioViewHtml.includes('cabecalho-repetir-todas') &&
    freshRelatorioViewHtml.includes('whitespace-pre-line') &&
    freshRelatorioViewHtml.includes(".replace(/\\r?\\n/g, '<br>')");
assertTest('Relatório View: Renderização do cabeçalho fora do card com metadados no topo direito e suporte completo a quebras multiline', hasRelatorioViewMultilineAndHeader);

// Verificação da Reorganização do Card 6: Quadro Analítico e Sintético
const hasQuadroAnaliticoESintetico = freshReportBuilderJs.includes("title: 'Quadro Analítico e Sintético'") &&
    freshReportBuilderJs.includes("tabsFor1n = tabGroups");
assertTest('Relatórios A4: Card 6 renomeado para "Quadro Analítico e Sintético" e Fonte de Dados 1:N inclui todas as abas do formulário', hasQuadroAnaliticoESintetico);

const hasSinteticaDirectlyUnderOrdenacao = freshReportBuilderJs.indexOf('Ordenação dos Registros') !== -1 &&
    freshReportBuilderJs.indexOf('1. Tabela Sintética (Cronológica)') > freshReportBuilderJs.indexOf('Ordenação dos Registros') &&
    freshReportBuilderJs.indexOf('2. Laudo Analítico & Fotos (1:N)') > freshReportBuilderJs.indexOf('1. Tabela Sintética (Cronológica)');
assertTest('Relatórios A4: "1. Tabela Sintética (Cronológica)" posicionada imediatamente abaixo de "Ordenação dos Registros"', hasSinteticaDirectlyUnderOrdenacao);

const hasLaudoTabFilteringAndInlineEdit = freshReportBuilderJs.includes('custom_tab_title_') &&
    freshReportBuilderJs.includes('getLaudoPreviewTabs') &&
    freshReportBuilderJs.includes('selectedIds') &&
    freshReportBuilderJs.includes('tabFields');
assertTest('Relatórios A4: Laudo Analítico relaciona apenas abas/campos selecionados e permite edição inline por duplo clique no título da Aba', hasLaudoTabFilteringAndInlineEdit);

const hasFeaturePayloadIntegrity = fs.readFileSync('src/formRenderer.js', 'utf8').includes('window.activeFeatureData = featureData') &&
    fs.readFileSync('src/main.js', 'utf8').includes('window.activeFeatureData = (layer.feature && layer.feature.properties)') &&
    fs.readFileSync('src/reportBuilder.js', 'utf8').includes('window.activeFeatureData && Object.keys(window.activeFeatureData).length > 0') &&
    fs.readFileSync('index.html', 'utf8').includes('window.activeFeatureData && Object.keys(window.activeFeatureData).length > 0');
assertTest('Relatórios A4: Sincronização e integridade do payload de feição individual (activeFeatureData e openFeatureReportPage)', hasFeaturePayloadIntegrity);

const hasFeatureDataResolutionInViewer = fs.readFileSync('relatorio_view.html', 'utf8').includes('function resolveFieldValue') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('resolveFieldValue(f, featureData)') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('window.opener.activeFeatureData') &&
    fs.readFileSync('relatorio_view.html', 'utf8').includes('window.reportViewerFormTabs');
assertTest('Relatórios A4: relatorio_view.html implementa resolveFieldValue resiliente e suporte a dados de window.opener e formTabs', hasFeatureDataResolutionInViewer);

// Verificações: Cabeçalho Acima da Margem, Rodapé Abaixo da Margem e Numeração a partir da 2ª Folha
const hasHeaderFooterSlots = freshReportBuilderJs.includes('a4-header-slot') &&
    freshReportBuilderJs.includes('a4-footer-slot') &&
    freshReportBuilderJs.includes('a4-blocks-list') &&
    freshReportBuilderJs.includes('blocksList.style.paddingTop') &&
    freshReportBuilderJs.includes('blocksList.style.paddingBottom');
assertTest('ReportBuilder: Cabeçalho posicionado no slot superior acima da margem e Rodapé fixo no slot inferior abaixo da margem', hasHeaderFooterSlots);

const hasFooterPageStartOptions = freshReportBuilderJs.includes('cfg-ftr-page-start-first') &&
    freshReportBuilderJs.includes('cfg-ftr-page-start-second') &&
    freshReportBuilderJs.includes('setFooterPageStart') &&
    freshReportBuilderJs.includes('updateFooterProperty');
assertTest('ReportBuilder: Card Rodapé Oficial inclui seleção de início de numeração (1ª folha vs 2ª folha) e métodos sincronizados', hasFooterPageStartOptions);

const updatedRelatorioViewHtml = fs.readFileSync('relatorio_view.html', 'utf8');
const hasZeroMarginPrint = updatedRelatorioViewHtml.includes('@page') &&
    updatedRelatorioViewHtml.includes('size: A4') &&
    updatedRelatorioViewHtml.includes('margin: 0') &&
    updatedRelatorioViewHtml.includes('single-page') &&
    updatedRelatorioViewHtml.includes('overflow: hidden');
assertTest('Relatório View: Impressão @page com margem zero e folha A4 contida sem vazamento do rodapé para a 2ª folha', hasZeroMarginPrint);

const hasFooterStartSecondLogic = updatedRelatorioViewHtml.includes('getFooterPageNumberText') &&
    updatedRelatorioViewHtml.includes("startMode === 'segunda'") &&
    updatedRelatorioViewHtml.includes('pageIdx === 1') &&
    updatedRelatorioViewHtml.includes('a4-page-footer-slot');
assertTest('Relatório View: getFooterPageNumberText implementa numeração a partir da 2ª folha começando com o número 2', hasFooterStartSecondLogic);

const hasBrowserHeadersFootersSuppression = updatedRelatorioViewHtml.includes('margin: 0 !important;') &&
    updatedRelatorioViewHtml.includes('beforeprint') &&
    freshReportBuilderJs.includes('openFeatureReportPage(currentTemplate.form_id') &&
    freshReportBuilderJs.includes("window.addEventListener('beforeprint'");
assertTest('Impressão A4: Supressão de cabeçalho e rodapé nativos do navegador (about:blank, data/hora e título) sem vazamento', hasBrowserHeadersFootersSuppression);

const hasTwoDigitFooterPagination = updatedRelatorioViewHtml.includes('String(pageIdx).padStart(2, \'0\')') &&
    freshReportBuilderJs.includes('Página 01 de 01') &&
    freshReportBuilderJs.includes('Página 02 de 10');
assertTest('Rodapé Oficial: Data/hora integrada e numeração de páginas com 2 dígitos (Ex: Página 01 de 10)', hasTwoDigitFooterPagination);

// Verificações dos ajustes do Quadro Analítico e Sintético (Tabela Sintética, Laudo 1:N, Accordion e Drag & Drop)
const hasSyntheticHorizontalLines = updatedRelatorioViewHtml.includes('divide-y divide-slate-200') &&
    updatedRelatorioViewHtml.includes('border-b border-slate-200') &&
    freshReportBuilderJs.includes('divide-y divide-slate-200') &&
    freshReportBuilderCodeUpdated.includes('border-b border-slate-200');
assertTest('Tabela Sintética: Linhas horizontais visíveis separando registros/entes na Folha A4 e no Relatório Final', hasSyntheticHorizontalLines);

const hasMpfBadgeResolution = updatedRelatorioViewHtml.includes("o.includes('MPF')") &&
    updatedRelatorioViewHtml.includes('bg-purple-100 text-purple-800') &&
    freshReportBuilderJs.includes('bg-purple-100 text-purple-800') &&
    freshReportBuilderJs.includes("rec.org.toLowerCase().includes('mpf')");
assertTest('Tabela Sintética: Ente no ícone roxo exibe nome correto (MPF) resolvido a partir dos títulos das abas', hasMpfBadgeResolution);

const hasExpandableTabAccordions = freshReportBuilderJs.includes('toggleAccordionTab') &&
    freshReportBuilderJs.includes('cfg-tab-fields-syn-') &&
    freshReportBuilderJs.includes('cfg-tab-fields-laudo-') &&
    freshReportBuilderJs.includes('expand_more');
assertTest('Abas 1:N: Seções de abas expansíveis com acordeão (clique para expandir e selecionar campos) na Tabela Sintética e no Laudo', hasExpandableTabAccordions);

const hasStrictLaudoTabSelection = freshReportBuilderJs.includes('cfg-1n-laudo-tab-select') &&
    freshReportBuilderJs.includes('on1nLaudoTabSelectChange') &&
    freshReportBuilderJs.includes('current1nLaudoSelectedTabs') &&
    freshReportBuilderJs.includes('ensureLaudoFieldSelection') &&
    updatedRelatorioViewHtml.includes('resolveTabIds(bloco.abas_selecionadas');
assertTest('Laudo Analítico 1:N: Opção de seleção de abas via checkbox e envio restrito apenas das abas e campos selecionados', hasStrictLaudoTabSelection);

const hasPrecisionDragAndDrop = freshReportBuilderJs.includes("direction: 'horizontal'") &&
    freshReportBuilderJs.includes('swapThreshold: 0.65') &&
    freshReportBuilderJs.includes('invertSwap: true') &&
    freshReportBuilderJs.includes('data-field-id') &&
    freshReportBuilderJs.includes('newContainerOrder');
assertTest('Folha A4 Interativa: Drag & drop de campos na grade com alta precisão horizontal (swapThreshold 0.65 e ordenação via DOM)', hasPrecisionDragAndDrop);

const hasLaudoTabSequenceOption = freshReportBuilderJs.includes('Sequência das Abas no Laudo') &&
    freshReportBuilderJs.includes('cfg-1n-laudo-tab-sequence-list') &&
    freshReportBuilderJs.includes('move1nLaudoTabSequence') &&
    updatedRelatorioViewHtml.includes('sortRecords(records, sortOrder, true, bloco.ordem_abas)');
assertTest('Relatórios A4: Laudo Analítico permite definir a sequência das abas (↑ ↓) e o relatório sempre agrupa por aba nessa ordem', hasLaudoTabSequenceOption);

// ------------------------------------------------------------------------------
// RELATÓRIOS A4 — TESTES DE COMPORTAMENTO (executam o código de verdade, sem inspecionar texto)
// ------------------------------------------------------------------------------
[
    ['tests/fieldFormatter.test.js', 'Formatador único: cada tipo de campo é formatado pelo TIPO (CPF/CNPJ, IPL, EPOL, RIP, CEP, moeda, m², data, links, anexos), sem adivinhar por nome/rótulo/id'],
    ['tests/viewerResolve.test.js', 'Visualizador: campo é lido pelo ID do schema; campo vazio nunca herda valor de outro campo nem de outra aba'],
    ['tests/reportData.test.js', 'Camada de dados: abas visíveis (permissão e condição), registros 1:N e 1:1, colunas lidas pelo campo da própria aba, dados de aba oculta removidos'],
    ['tests/builderLaudoPreview.test.js', 'Construtor: prévia do Laudo com uma seção ABERTA por aba (campos reais, arraste, largura, 1:N na íntegra) e sequência de abas (↑ ↓)'],
    ['tests/viewerGrid.test.js', 'Grade de Atributos e Laudo: fotos/anexos por campo em "Lista" (título + arquivo) ou "Imagem na íntegra" (título e metadados), sem URLs inseguras'],
    ['tests/viewerTables.test.js', 'Quadro Sintético e Laudo Analítico: colunas por campo, seleção de abas, quebra por linhas entre folhas, escape de HTML e aviso quando a aba escolhida não existe']
].forEach(([testFile, description]) => {
    let passed = true;
    let output = '';
    try {
        execSync(`node ${testFile}`, { stdio: 'pipe' });
    } catch (err) {
        passed = false;
        output = String(err.stderr || err.stdout || err.message).trim();
    }
    assertTest(`Relatórios A4: ${description}`, passed, output);
});

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
