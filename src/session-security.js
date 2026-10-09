// src/session-security.js
/**
 * Módulo de Segurança de Sessão — Auto-Logout por Inatividade e Suporte a Modo Offline / Campo
 * - Monitoramento contínuo de atividade do usuário (mouse, teclado, toques, scroll, GPS em campo)
 * - Sincronização entre múltiplas abas via localStorage e BroadcastChannel
 * - Tempo de Inatividade: 15 minutos (900s)
 * - Aviso Prévio com Contagem Regressiva: 60 segundos antes de encerrar (aos 14 minutos)
 * - Blindagem Offline: quando sem conexão ou em Modo Campo, suspende o logout destrutivo e ativa Bloqueio por PIN Local
 * - Deslocamento via GPS (> 4m) conta como atividade do usuário durante a coleta em campo
 */

(function() {
    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
    const WARNING_DURATION_MS = 60 * 1000;      // 60 segundos de contagem regressiva
    const WARNING_THRESHOLD_MS = INACTIVITY_LIMIT_MS - WARNING_DURATION_MS; // 14 minutos

    const STORAGE_KEY = 'geogestor_last_activity_ts';
    const WORKING_HEARTBEAT_KEY = 'geogestor_working_heartbeat_ts';
    const EXPIRED_FLAG_KEY = 'geogestor_session_expired';
    const BROADCAST_CHANNEL_NAME = 'geogestor_session_channel';
    const OFFLINE_PIN_KEY = 'geogestor_offline_pin';
    const MODO_CAMPO_KEY = 'geogestor_modo_campo';

    const _setInterval = (typeof setInterval === 'function') ? setInterval : (typeof window !== 'undefined' && typeof window.setInterval === 'function') ? window.setInterval.bind(window) : function() { return 0; };
    const _clearInterval = (typeof clearInterval === 'function') ? clearInterval : (typeof window !== 'undefined' && typeof window.clearInterval === 'function') ? window.clearInterval.bind(window) : function() {};
    const _setTimeout = (typeof setTimeout === 'function') ? setTimeout : (typeof window !== 'undefined' && typeof window.setTimeout === 'function') ? window.setTimeout.bind(window) : function() { return 0; };
    const _clearTimeout = (typeof clearTimeout === 'function') ? clearTimeout : (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') ? window.clearTimeout.bind(window) : function() {};

    let timerInterval = null;
    let warningModalEl = null;
    let countdownNumberEl = null;
    let isWarningOpen = false;
    let offlineLockModalEl = null;
    let isOfflineLocked = false;
    let lastThrottledRecord = 0;
    let broadcastChannel = null;
    let lastGpsCoords = null;

    // Detecta se o usuário está trabalhando ativamente em um formulário ou em tela de relatório
    function isUserActivelyWorking() {
        if (typeof window === 'undefined' || typeof document === 'undefined') return false;

        // 1. Tela de Relatório (relatorio.html, relatorio_view.html ou qualquer rota de relatório)
        const loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
        const path = (loc && loc.pathname) ? String(loc.pathname).toLowerCase() : '';
        const href = (loc && loc.href) ? String(loc.href).toLowerCase() : '';
        if (path.includes('relatorio') || href.includes('relatorio')) {
            return true;
        }

        // 2. Construtor de formulários ou configuração de campos em settings.html
        if (path.includes('settings.html')) {
            const fbModal = document.getElementById('form-builder-modal');
            if (fbModal && !fbModal.classList.contains('hidden') && fbModal.style.display !== 'none') {
                return true;
            }
            const fxModal = document.getElementById('formula-modal');
            if (fxModal && !fxModal.classList.contains('hidden') && fxModal.style.display !== 'none') {
                return true;
            }
        }

        // 3. Foco em qualquer campo de entrada, texto ou formulário ativo
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return true;
        }

        // 4. Modais ou painéis de formulário visíveis e abertos na página
        const formModalSelectors = [
            '#feature-info-modal',
            '#new-visit-modal',
            '#visits-modal',
            '#target-theme-select-modal',
            '#field-mapping-modal',
            '#new-theme-modal',
            '#edit-theme-modal',
            '#filter-fields-modal',
            '#remap-attributes-modal',
            '#edit-raster-modal',
            '#add-layer-modal',
            '#set-entity-modal',
            '#shared-layers-modal',
            '#project-modal',
            '#table-join-modal',
            '#orcamento-modal',
            '#measurement-report-modal',
            '#modal-tipo-area',
            '#coordinate-query-panel',
            '#form-builder-modal',
            '.modal-form-open',
            '[data-form-active="true"]'
        ];

        for (let sel of formModalSelectors) {
            const el = document.querySelector(sel);
            if (el) {
                const isHidden = el.classList.contains('hidden') || 
                                 el.style.display === 'none' || 
                                 el.style.visibility === 'hidden' || 
                                 el.getAttribute('aria-hidden') === 'true';
                if (!isHidden && (el.offsetWidth > 0 || el.offsetHeight > 0)) {
                    return true;
                }
            }
        }

        // 5. Qualquer modal ou drawer visível que contenha inputs/textarea/select ou tag <form>
        const visibleModals = document.querySelectorAll('.modal:not(.hidden), [id*="modal"]:not(.hidden), [id*="drawer"]:not(.hidden), [class*="drawer"]:not(.hidden)');
        for (let m of visibleModals) {
            if (m.id === 'session-warning-modal' || m.id === 'session-lgpd-modal' || m.id === 'session-offline-lock-modal') continue;
            if (m.offsetWidth > 0 && m.offsetHeight > 0) {
                if (m.querySelector('input, textarea, select, form')) {
                    return true;
                }
            }
        }

        // 6. Variáveis de controle de formulário / edição
        if (window.isFormOpen === true || window.isEditingFeature === true || window.currentOpenForm) {
            return true;
        }

        return false;
    }

    // Emite heartbeat de trabalho ativo (preserva a sessão em todas as abas)
    function emitWorkingHeartbeat() {
        const now = Date.now();
        try {
            localStorage.setItem(WORKING_HEARTBEAT_KEY, String(now));
            localStorage.setItem(STORAGE_KEY, String(now));
            localStorage.removeItem(EXPIRED_FLAG_KEY);
        } catch(e) {}
        if (broadcastChannel) {
            try { broadcastChannel.postMessage({ type: 'WORKING_HEARTBEAT', timestamp: now }); } catch(e) {}
        }
    }

    // Detecta se o sistema está offline ou em modo de coleta de campo
    function isSystemOffline() {
        const isOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);
        const isModoCampo = localStorage.getItem(MODO_CAMPO_KEY) === 'true';
        return isOffline || isModoCampo;
    }

    // Inicializa BroadcastChannel se disponível no navegador
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
            broadcastChannel.onmessage = function(ev) {
                if (ev.data && (ev.data.type === 'ACTIVITY_RESET' || ev.data.type === 'WORKING_HEARTBEAT')) {
                    hideWarningModal();
                    recordActivity();
                } else if (ev.data && ev.data.type === 'FORCE_LOGOUT') {
                    performLogout(true, true);
                } else if (ev.data && ev.data.type === 'OFFLINE_UNLOCK') {
                    hideOfflineLockModal();
                }
            };
        }
    } catch(e) {}

    // Toast discreto de notificação de segurança e rede
    function showSessionToast(message, icon = 'info', color = 'sky') {
        const existing = document.getElementById('session-security-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'session-security-toast';
        toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-950/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-amber-500/40 z-[999999] flex items-center gap-3 transition-all duration-300 transform translate-y-10 opacity-0 pointer-events-none select-none';
        toast.innerHTML = `
            <span class="material-symbols-outlined text-amber-400 text-xl">${icon}</span>
            <span class="font-medium text-xs tracking-wide text-slate-100">${message}</span>
        `;
        document.body.appendChild(toast);
        _setTimeout(() => toast.classList.remove('translate-y-10', 'opacity-0'), 10);
        _setTimeout(() => {
            toast.classList.add('translate-y-10', 'opacity-0');
            _setTimeout(() => toast.remove(), 350);
        }, 4000);
    }

    // Registra atividade atual do usuário
    function recordActivity() {
        const now = Date.now();
        // Throttle para não gravar no localStorage a cada milissegundo de movimento do mouse
        if (now - lastThrottledRecord > 1500) {
            lastThrottledRecord = now;
            try {
                localStorage.setItem(STORAGE_KEY, String(now));
                localStorage.removeItem(EXPIRED_FLAG_KEY);
            } catch(e) {}

            if (isWarningOpen) {
                hideWarningModal();
                if (broadcastChannel) {
                    try { broadcastChannel.postMessage({ type: 'ACTIVITY_RESET', timestamp: now }); } catch(e) {}
                }
            }
        }
    }

    function getLastActivity() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? parseInt(stored, 10) : 0;
        } catch(e) {
            return 0;
        }
    }

    // Cria e injeta o Modal de Aviso de Inatividade na página (Online)
    function ensureWarningModal() {
        if (document.getElementById('inactivity-warning-modal')) {
            warningModalEl = document.getElementById('inactivity-warning-modal');
            countdownNumberEl = document.getElementById('inactivity-countdown-timer');
            return;
        }

        const modalHtml = `
        <div id="inactivity-warning-modal" style="display: none; z-index: 999999;" class="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 select-none">
            <div style="background-color: #0b1329; border: 2px solid #f59e0b;" class="rounded-2xl p-6 max-w-sm w-full shadow-[0_0_50px_rgba(245,158,11,0.3)] flex flex-col items-center text-center text-white animate-bounce-short">
                
                <!-- Ícone Animado -->
                <div class="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-4 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                    <span class="material-symbols-outlined text-[34px] animate-pulse">lock_clock</span>
                </div>

                <h3 class="text-base font-black tracking-wide text-white mb-1.5">Sessão Expirando por Inatividade</h3>
                
                <p class="text-xs text-slate-300 mb-4 leading-relaxed">
                    Você esteve inativo por quase 15 minutos. Por motivos de segurança, sua sessão será encerrada em:
                </p>

                <!-- Cronômetro Circular em Destaque -->
                <div class="mb-5 flex items-center justify-center">
                    <div style="background-color: #030712; border: 2px solid #ef4444;" class="px-5 py-2.5 rounded-xl shadow-inner flex items-center gap-2">
                        <span class="material-symbols-outlined text-[20px] text-rose-400 animate-spin">timelapse</span>
                        <span id="inactivity-countdown-timer" class="font-mono text-2xl font-black text-rose-400 tracking-wider">60s</span>
                    </div>
                </div>

                <!-- Botões de Ação -->
                <div class="flex items-center gap-2.5 w-full">
                    <button id="btn-inactivity-logout" class="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-white/10 cursor-pointer">
                        Sair Agora
                    </button>
                    <button id="btn-inactivity-keep" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all cursor-pointer">
                        Continuar Conectado
                    </button>
                </div>
            </div>
        </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHtml.trim();
        document.body.appendChild(div.firstChild);

        warningModalEl = document.getElementById('inactivity-warning-modal');
        countdownNumberEl = document.getElementById('inactivity-countdown-timer');

        document.getElementById('btn-inactivity-keep')?.addEventListener('click', function() {
            recordActivity();
            hideWarningModal();
        });

        document.getElementById('btn-inactivity-logout')?.addEventListener('click', function() {
            performLogout(false, true);
        });
    }

    function showWarningModal(remainingSec) {
        if (!warningModalEl) ensureWarningModal();
        if (warningModalEl) {
            warningModalEl.style.display = 'flex';
            isWarningOpen = true;
            if (countdownNumberEl) {
                countdownNumberEl.textContent = `${Math.max(0, Math.ceil(remainingSec))}s`;
            }
        }
    }

    function hideWarningModal() {
        if (warningModalEl) {
            warningModalEl.style.display = 'none';
            isWarningOpen = false;
        }
    }

    // Cria e injeta a Tela de Bloqueio por PIN / Desbloqueio Local (Modo Offline / Campo)
    function ensureOfflineLockModal() {
        if (document.getElementById('offline-lock-modal')) {
            offlineLockModalEl = document.getElementById('offline-lock-modal');
            return;
        }

        const configuredPin = localStorage.getItem(OFFLINE_PIN_KEY);

        const modalDiv = document.createElement('div');
        modalDiv.id = 'offline-lock-modal';
        modalDiv.style.display = 'none';
        modalDiv.style.zIndex = '9999999';
        modalDiv.className = 'fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-4 select-none';
        modalDiv.innerHTML = `
            <div style="background-color: #0b1329; border: 2px solid #f59e0b;" class="rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-[0_0_60px_rgba(245,158,11,0.35)] flex flex-col items-center text-center text-white animate-bounce-short">
                
                <!-- Ícone Animado -->
                <div class="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 text-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.35)]">
                    <span class="material-symbols-outlined text-[36px]">wifi_off</span>
                </div>

                <h3 class="text-lg font-black tracking-wide text-white mb-1">Modo Offline / Campo</h3>
                
                <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold mb-3">
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>Sessão Bloqueada por Inatividade</span>
                </div>

                <p class="text-xs text-slate-300 mb-5 leading-relaxed">
                    Você esteve inativo por 15 minutos, mas sua sessão e as coletas locais foram <strong>blindadas e salvas no aparelho</strong>. Nenhuma feição ou anexo foi perdido.
                </p>

                <!-- Área de Desbloqueio -->
                <div id="offline-lock-pin-container" class="w-full flex flex-col items-center">
                    ${configuredPin ? `
                        <div class="w-full mb-4">
                            <label class="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 text-left">Digite seu PIN de 4 dígitos:</label>
                            <input type="password" id="offline-lock-pin-input" inputmode="numeric" maxlength="4" placeholder="••••" class="w-full text-center tracking-[0.5em] text-2xl font-black py-2.5 rounded-xl bg-slate-900 border border-amber-500/50 text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400">
                            <div id="offline-lock-pin-error" class="text-rose-400 text-[11px] font-bold mt-1.5 hidden">PIN incorreto. Tente novamente.</div>
                        </div>
                        <button id="btn-offline-unlock-pin" class="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(245,158,11,0.4)] active:scale-95 transition-all cursor-pointer">
                            Desbloquear Coleta
                        </button>
                    ` : `
                        <button id="btn-offline-unlock-quick" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95 transition-all cursor-pointer mb-2.5 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">lock_open</span>
                            <span>Desbloquear e Continuar Coleta</span>
                        </button>
                        <div class="text-[10.5px] text-slate-400">
                            Sua sessão permanecerá ativa no aparelho para continuidade da coleta em campo.
                        </div>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
        offlineLockModalEl = modalDiv;

        // Binds de Desbloqueio
        const quickBtn = document.getElementById('btn-offline-unlock-quick');
        if (quickBtn) {
            quickBtn.addEventListener('click', function() {
                unlockOfflineSession();
            });
        }

        const pinBtn = document.getElementById('btn-offline-unlock-pin');
        const pinInput = document.getElementById('offline-lock-pin-input');
        const pinError = document.getElementById('offline-lock-pin-error');
        if (pinBtn && pinInput) {
            function verifyPin() {
                const entered = pinInput.value.trim();
                const expected = localStorage.getItem(OFFLINE_PIN_KEY);
                if (entered === expected) {
                    if (pinError) pinError.classList.add('hidden');
                    unlockOfflineSession();
                } else {
                    if (pinError) pinError.classList.remove('hidden');
                    pinInput.value = '';
                    pinInput.focus();
                }
            }
            pinBtn.addEventListener('click', verifyPin);
            pinInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') verifyPin();
            });
        }
    }

    function showOfflineLockModal() {
        isOfflineLocked = true;
        ensureOfflineLockModal();
        if (offlineLockModalEl) {
            offlineLockModalEl.style.display = 'flex';
            const pinInput = document.getElementById('offline-lock-pin-input');
            if (pinInput) _setTimeout(() => pinInput.focus(), 100);
        }
    }

    function hideOfflineLockModal() {
        isOfflineLocked = false;
        if (offlineLockModalEl) {
            offlineLockModalEl.style.display = 'none';
        }
    }

    function unlockOfflineSession() {
        hideOfflineLockModal();
        recordActivity();
        if (broadcastChannel) {
            try { broadcastChannel.postMessage({ type: 'OFFLINE_UNLOCK' }); } catch(e) {}
        }
        showSessionToast("Sessão offline desbloqueada. Coleta pronta!", "check_circle", "emerald");
    }

    // Executa Logout Completo e Invalida Chaves de Sessão
    async function performLogout(skipBroadcast = false, force = false) {
        // Se estiver trabalhando em formulário ou relatório (nesta aba ou em outra), cancela logout automático!
        if (!force && isUserActivelyWorking()) {
            console.log("🛡️ Logout automático cancelado: Usuário trabalhando em formulário ou relatório.");
            recordActivity();
            emitWorkingHeartbeat();
            hideWarningModal();
            return;
        }
        const lastWorking = parseInt(localStorage.getItem(WORKING_HEARTBEAT_KEY) || '0', 10);
        if (!force && lastWorking && (Date.now() - lastWorking < 120000)) {
            console.log("🛡️ Logout automático cancelado: Usuário ativo em outra aba (relatório ou formulário).");
            recordActivity();
            hideWarningModal();
            return;
        }

        // Se estiver offline ou em tela de mapa/coleta, protege a sessão com bloqueio local em vez de logout destrutivo
        const loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
        const curPath = (loc && loc.pathname) ? String(loc.pathname).toLowerCase() : '';
        const isMapScreen = curPath.endsWith('index.html') || curPath.endsWith('/') || (typeof window !== 'undefined' && (window.map || window.themes));
        if (!force && (isSystemOffline() || isMapScreen)) {
            console.warn("🛡️ Dispositivo em Campo / Tela de Mapa ativa. Ativando Bloqueio Local suave em vez de logout destrutivo para proteger coletas e camadas.");
            hideWarningModal();
            showOfflineLockModal();
            return;
        }

        if (!skipBroadcast && broadcastChannel) {
            try { broadcastChannel.postMessage({ type: 'FORCE_LOGOUT' }); } catch(e) {}
        }

        _clearInterval(timerInterval);
        
        try {
            sessionStorage.clear();
            localStorage.setItem(EXPIRED_FLAG_KEY, 'true');
            localStorage.removeItem(STORAGE_KEY);

            // Limpeza completa de todos os tokens do Supabase no localStorage
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch(e) {}

        if (window.supabaseClient) {
            try { await window.supabaseClient.auth.signOut({ scope: 'global' }); } catch(e) {}
        }

        if (typeof window !== 'undefined' && window.location && typeof window.location.replace === 'function') {
            window.location.replace('login.html?reason=inactivity');
        }
    }

    // Loop de Verificação de Inatividade a cada 1 segundo
    function checkInactivityLoop() {
        if (isOfflineLocked) return; // Se já está com a tela de bloqueio offline visível, aguarda desbloqueio

        // 1. Se o usuário estiver trabalhando ativamente nesta aba (em formulário ou página de relatório)
        if (isUserActivelyWorking()) {
            recordActivity();
            emitWorkingHeartbeat();
            if (isWarningOpen) hideWarningModal();
            return;
        }

        // 2. Se outra aba do sistema estiver ativa com relatório ou formulário aberto nos últimos 2 minutos
        const lastWorking = parseInt(localStorage.getItem(WORKING_HEARTBEAT_KEY) || '0', 10);
        if (lastWorking && (Date.now() - lastWorking < 120000)) {
            recordActivity();
            if (isWarningOpen) hideWarningModal();
            return;
        }

        // 3. Se o sistema estiver realizando um upload pesado ou envio de ortofoto, renova automaticamente a sessão
        const isUploadActive = (typeof window !== 'undefined') && (
            window.isSystemProcessingBackgroundUpload === true || 
            window.isUploadingTiles === true ||
            (document.getElementById('upload-progress-container') && 
             !document.getElementById('upload-progress-container').classList.contains('hidden') &&
             document.getElementById('upload-progress-bar') && 
             document.getElementById('upload-progress-bar').style.width !== '100%')
        );
        if (isUploadActive) {
            recordActivity();
            emitWorkingHeartbeat();
            if (isWarningOpen) hideWarningModal();
            return;
        }

        const lastAct = getLastActivity();
        if (!lastAct) {
            recordActivity();
            return;
        }

        const elapsed = Date.now() - lastAct;

        if (elapsed >= INACTIVITY_LIMIT_MS) {
            // Tempo esgotado (15 min)
            const loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
            const curPath = (loc && loc.pathname) ? String(loc.pathname).toLowerCase() : '';
            const isMapScreen = curPath.endsWith('index.html') || curPath.endsWith('/') || (typeof window !== 'undefined' && (window.map || window.themes));
            if (isSystemOffline() || isMapScreen) {
                hideWarningModal();
                showOfflineLockModal();
            } else {
                performLogout();
            }
        } else if (elapsed >= WARNING_THRESHOLD_MS) {
            // Entre 14 e 15 minutos -> Exibe aviso com contagem regressiva
            const remainingMs = INACTIVITY_LIMIT_MS - elapsed;
            const remainingSec = remainingMs / 1000;
            showWarningModal(remainingSec);
        } else {
            // Usuário ativo -> Garante modal fechado
            if (isWarningOpen) {
                hideWarningModal();
            }
        }
    }

    // Modal LGPD / Termos de Uso em todas as telas protegidas
    function ensureLgpdModal() {
        try {
            if (sessionStorage.getItem('geogestor_lgpd_accepted') === 'true') {
                return;
            }
        } catch(e) {}

        if (document.getElementById('session-lgpd-modal')) {
            return;
        }

        const modalDiv = document.createElement('div');
        modalDiv.id = 'session-lgpd-modal';
        modalDiv.style.zIndex = '999998';
        modalDiv.className = 'fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 select-none';
        modalDiv.innerHTML = `
            <div class="bg-white dark:bg-[#0B1120] text-slate-800 dark:text-slate-100 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div class="px-6 pt-6 pb-2 text-center border-b border-slate-100 dark:border-slate-800/80">
                    <h2 class="text-xl md:text-2xl font-black text-slate-800 dark:text-white tracking-tight">Termos de Uso</h2>
                    <h3 class="text-xs md:text-sm font-bold text-slate-600 dark:text-slate-300 mt-1">Aviso para Proteção dos Dados Pessoais (LGPD)</h3>
                </div>
                <div class="p-6 overflow-y-auto max-h-[58vh] space-y-4 text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed text-justify">
                    <p>
                        Os dados pessoais acessados por meio do sistema devem ser utilizados exclusivamente para o cumprimento de finalidades de interesse público e das atribuições legais do serviço público, sendo vedada sua utilização posterior para fins incompatíveis com aqueles que justificaram o acesso.
                    </p>
                    <p>
                        O acesso e o tratamento dos dados pessoais devem limitar-se ao estritamente necessário para o cumprimento da finalidade pública específica, abrangendo somente informações pertinentes e adequadas, de forma proporcional e sem utilização de dados excessivos.
                    </p>
                    <p>
                        Com o objetivo de assegurar a proteção e a segurança das informações, os dados pessoais obtidos por meio do <strong>GeoGestor</strong> deverão ser mantidos sob sigilo e ter seu acesso restrito aos agentes públicos devidamente legitimados. As alterações e edições realizadas no sistema permanecerão registradas, para fins de rastreabilidade e identificação dos respectivos responsáveis.
                    </p>
                    <p>
                        A violação às disposições da LGPD pode ensejar a responsabilização dos agentes públicos nas esferas administrativo-disciplinar, cível e criminal.
                    </p>
                </div>
                <div class="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800/80 flex justify-center">
                    <button id="session-lgpd-continue-btn" type="button" class="w-full sm:w-auto min-w-[200px] px-8 py-3 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-md shadow-orange-500/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2">
                        <span>Continuar</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);

        const btn = document.getElementById('session-lgpd-continue-btn');
        if (btn) {
            btn.addEventListener('click', function() {
                try {
                    sessionStorage.setItem('geogestor_lgpd_accepted', 'true');
                } catch(e) {}
                if (window.auditLogger && typeof window.auditLogger.log === 'function') {
                    window.auditLogger.log('TERMO_LGPD_CIENTE', 'Ciência e aceite dos Termos de Uso e Proteção de Dados (LGPD)');
                }
                modalDiv.remove();
            });
        }
    }

    // Inicia o módulo de segurança com validação rigorosa pré-renderização
    function initSessionSecurity() {
        const loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
        const currentPath = (loc && loc.pathname) ? String(loc.pathname).toLowerCase() : '';
        // Não ativa o detector na página de login ou registro público
        if (currentPath.endsWith('login.html') || currentPath.endsWith('signup.html') || currentPath.endsWith('forgot-password.html') || currentPath.endsWith('reset-password.html')) {
            return;
        }

        // 1. CHECAGEM CRÍTICA DE EXPIRAÇÃO PREGRESSA (Bloqueia reentrada por Favoritos)
        const isExpired = localStorage.getItem(EXPIRED_FLAG_KEY) === 'true';
        const lastAct = getLastActivity();
        const lastWorking = parseInt(localStorage.getItem(WORKING_HEARTBEAT_KEY) || '0', 10);
        const hasRecentHeartbeat = lastWorking && (Date.now() - lastWorking < 120000);
        const now = Date.now();

        // Expira APENAS se não estiver trabalhando ativamente e o tempo limite tiver sido excedido
        if (!isUserActivelyWorking() && !hasRecentHeartbeat) {
            if ((lastAct && (now - lastAct >= INACTIVITY_LIMIT_MS)) || (isExpired && (!lastAct || now - lastAct >= 120000))) {
                if (isSystemOffline()) {
                    console.log("🛡️ Sistema em Modo Offline / Campo — Bloqueio local ativado em vez de logout.");
                    showOfflineLockModal();
                    return;
                }
                console.warn("🛡️ Sessão expirada por inatividade detectada. Redirecionando para login...");
                performLogout(true, true);
                return;
            }
        }

        // Limpa flag de expiração antiga e registra atividade atual
        try {
            localStorage.removeItem(EXPIRED_FLAG_KEY);
        } catch(e) {}
        recordActivity();
        if (isUserActivelyWorking()) {
            emitWorkingHeartbeat();
        }
        ensureWarningModal();
        ensureLgpdModal();

        // Eventos Globais de Monitoramento de Atividade (Mouse, Toque, Teclado, Scroll, Formulários/Digitação)
        const activityEvents = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll', 'input', 'change', 'focusin', 'select'];
        activityEvents.forEach(evt => {
            window.addEventListener(evt, recordActivity, { passive: true });
        });

        // Heartbeat periódico a cada 15 segundos se o usuário estiver em formulário ou tela de relatório
        _setInterval(() => {
            if (isUserActivelyWorking()) {
                emitWorkingHeartbeat();
            }
        }, 15000);

        // Wake Lock para evitar tela apagando durante coleta em campo
        let wakeLockSentinel = null;
        async function requestWakeLock() {
            try {
                if ('wakeLock' in navigator && !wakeLockSentinel && document.visibilityState === 'visible') {
                    wakeLockSentinel = await navigator.wakeLock.request('screen');
                    wakeLockSentinel.addEventListener('release', () => { wakeLockSentinel = null; });
                }
            } catch(e) {}
        }
        requestWakeLock();

        // Renovação imediata de atividade ao retornar da câmera nativa do celular ou reacender a tela
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                recordActivity();
                emitWorkingHeartbeat();
                requestWakeLock();
            }
        });

        // Monitoramento Contínuo por GPS: qualquer sinal recebido comprova operação de campo ativa
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            try {
                navigator.geolocation.watchPosition(
                    function(pos) {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        lastGpsCoords = { lat, lng };
                        recordActivity(); // Qualquer leitura de GPS em campo renova a sessão
                    },
                    function() {},
                    { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 }
                );
            } catch(e) {}
        }

        // Monitoramento de Rede (Online / Offline)
        window.addEventListener('offline', function() {
            showSessionToast("Dispositivo sem internet. Modo Offline ativo — Sessão e coletas preservadas.", "wifi_off", "amber");
        });
        window.addEventListener('online', function() {
            showSessionToast("Conexão com a internet restabelecida.", "wifi", "emerald");
        });

        // Loop de checagem a cada 1000ms
        timerInterval = _setInterval(checkInactivityLoop, 1000);
        console.log("🛡️ Sistema de Segurança de Sessão Ativo: Inatividade de 15 min com blindagem para Modo Offline / Campo.");
    }

    // Expõe API para controle de Modo Campo e PIN Offline
    window.SessionSecurity = {
        recordActivity: recordActivity,
        isSystemOffline: isSystemOffline,
        showOfflineLockModal: showOfflineLockModal,
        hideOfflineLockModal: hideOfflineLockModal,
        setOfflinePin: function(pin) {
            if (!pin || String(pin).length !== 4) return false;
            localStorage.setItem(OFFLINE_PIN_KEY, String(pin));
            return true;
        },
        removeOfflinePin: function() {
            localStorage.removeItem(OFFLINE_PIN_KEY);
        },
        hasOfflinePin: function() {
            return !!localStorage.getItem(OFFLINE_PIN_KEY);
        },
        toggleModoCampo: function(enable) {
            if (typeof enable === 'boolean') {
                localStorage.setItem(MODO_CAMPO_KEY, String(enable));
            } else {
                const current = localStorage.getItem(MODO_CAMPO_KEY) === 'true';
                localStorage.setItem(MODO_CAMPO_KEY, String(!current));
            }
            return localStorage.getItem(MODO_CAMPO_KEY) === 'true';
        },
        isModoCampo: function() {
            return localStorage.getItem(MODO_CAMPO_KEY) === 'true';
        },
        isActivelyWorking: isUserActivelyWorking,
        emitWorkingHeartbeat: emitWorkingHeartbeat,
        recordActivity: recordActivity,
        keepAlive: function() {
            recordActivity();
            emitWorkingHeartbeat();
            if (isWarningOpen) hideWarningModal();
        }
    };

    // Inicializa quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionSecurity);
    } else {
        initSessionSecurity();
    }
})();
