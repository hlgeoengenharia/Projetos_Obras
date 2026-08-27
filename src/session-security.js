// src/session-security.js
/**
 * Módulo de Segurança de Sessão — Auto-Logout por Inatividade
 * - Monitoramento contínuo de atividade do usuário (mouse, teclado, toques, scroll)
 * - Sincronização entre múltiplas abas via localStorage e BroadcastChannel
 * - Tempo de Inatividade: 15 minutos (900s)
 * - Aviso Prévio com Contagem Regressiva: 60 segundos antes de encerrar (aos 14 minutos)
 * - Logout seguro com limpeza de tokens e redirecionamento para login.html
 */

(function() {
    const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutos
    const WARNING_DURATION_MS = 60 * 1000;      // 60 segundos de contagem regressiva
    const WARNING_THRESHOLD_MS = INACTIVITY_LIMIT_MS - WARNING_DURATION_MS; // 14 minutos

    const STORAGE_KEY = 'geogestor_last_activity_ts';
    const BROADCAST_CHANNEL_NAME = 'geogestor_session_channel';

    let timerInterval = null;
    let warningModalEl = null;
    let countdownNumberEl = null;
    let isWarningOpen = false;
    let lastThrottledRecord = 0;
    let broadcastChannel = null;

    // Inicializa BroadcastChannel se disponível no navegador
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
            broadcastChannel.onmessage = function(ev) {
                if (ev.data && ev.data.type === 'ACTIVITY_RESET') {
                    hideWarningModal();
                } else if (ev.data && ev.data.type === 'FORCE_LOGOUT') {
                    performLogout(true);
                }
            };
        }
    } catch(e) {}

    // Registra atividade atual
    function recordActivity() {
        const now = Date.now();
        // Throttle para não gravar no localStorage a cada milissegundo de movimento do mouse
        if (now - lastThrottledRecord > 1500) {
            lastThrottledRecord = now;
            try {
                localStorage.setItem(STORAGE_KEY, String(now));
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
            return stored ? parseInt(stored, 10) : Date.now();
        } catch(e) {
            return Date.now();
        }
    }

    // Cria e injeta o Modal de Aviso na página
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
                    <button id="btn-inactivity-logout" class="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-white/10">
                        Sair Agora
                    </button>
                    <button id="btn-inactivity-keep" class="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all">
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
            performLogout();
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

    // Executa Logout e Redireciona
    async function performLogout(skipBroadcast = false) {
        if (!skipBroadcast && broadcastChannel) {
            try { broadcastChannel.postMessage({ type: 'FORCE_LOGOUT' }); } catch(e) {}
        }

        clearInterval(timerInterval);
        
        try {
            sessionStorage.clear();
            localStorage.removeItem('supabase.auth.token');
            localStorage.removeItem(STORAGE_KEY);
        } catch(e) {}

        if (window.supabaseClient) {
            try { await window.supabaseClient.auth.signOut(); } catch(e) {}
        }

        window.location.href = 'login.html?reason=inactivity';
    }

    // Loop de Verificação de Inatividade a cada 1 segundo
    function checkInactivityLoop() {
        const lastAct = getLastActivity();
        const elapsed = Date.now() - lastAct;

        if (elapsed >= INACTIVITY_LIMIT_MS) {
            // Tempo esgotado (15 min) -> Logout
            performLogout();
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

    // Inicia o módulo de segurança
    function initSessionSecurity() {
        const currentPath = window.location.pathname.toLowerCase();
        // Não ativa o detector na página de login ou registro público
        if (currentPath.endsWith('login.html') || currentPath.endsWith('signup.html') || currentPath.endsWith('forgot-password.html') || currentPath.endsWith('reset-password.html')) {
            return;
        }

        recordActivity();
        ensureWarningModal();

        // Eventos Globais de Monitoramento
        const activityEvents = ['mousemove', 'mousedown', 'pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
        activityEvents.forEach(evt => {
            window.addEventListener(evt, recordActivity, { passive: true });
        });

        // Loop de checagem a cada 1000ms
        timerInterval = setInterval(checkInactivityLoop, 1000);
        console.log("🛡️ Sistema de Segurança de Sessão Ativo: Inatividade de 15 min com aviso em 14 min.");
    }

    // Inicializa quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSessionSecurity);
    } else {
        initSessionSecurity();
    }
})();
