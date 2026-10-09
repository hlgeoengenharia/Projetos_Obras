// Configurações do Supabase
const SUPABASE_URL = 'https://iqejynikmeroiqyigsjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxZWp5bmlrbWVyb2lxeWlnc2pvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNjU2MDgsImV4cCI6MjA5ODk0MTYwOH0.aT91yVtQDYTluMUkx8HKoYrNhlniVC8Rd0iv2-LnASQ';

// Inicializa o cliente do Supabase
let supabaseClient = null;
try {
    if (window.supabase && SUPABASE_URL.startsWith('http')) {
        // Limpa resíduos legados de sessões antigas que ficaram no localStorage
        // para garantir que fechar a aba/janela exija novo login ao retornar
        try {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    localStorage.removeItem(key);
                }
            });
        } catch(e) {}

        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: window.sessionStorage,
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        window.supabaseClient = supabaseClient;
        console.log("Supabase client initialized (sessionStorage scoped).");

        const currentPath = window.location.pathname;
        const isPublicPage = currentPath.endsWith('login.html') || currentPath.endsWith('register.html') || currentPath.endsWith('signup.html') || currentPath.endsWith('forgot-password.html') || currentPath.endsWith('reset-password.html') || currentPath.endsWith('verificar.html');

        // Monitoramento Proativo de Sessão
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_OUT' && !isPublicPage) {
                sessionStorage.removeItem('municipio_ativo');
                window.location.href = 'login.html';
            }
        });

        // Sincronização e proteção contra descarte de memória no mobile (Tab Discarding)
        try {
            const munFromSession = sessionStorage.getItem('municipio_ativo');
            const munFromLocal = localStorage.getItem('municipio_ativo');
            if (!munFromSession && munFromLocal) {
                sessionStorage.setItem('municipio_ativo', munFromLocal);
                const munNomeLocal = localStorage.getItem('municipio_ativo_nome');
                if (munNomeLocal) sessionStorage.setItem('municipio_ativo_nome', munNomeLocal);
            } else if (munFromSession && !munFromLocal) {
                localStorage.setItem('municipio_ativo', munFromSession);
                const munNomeSession = sessionStorage.getItem('municipio_ativo_nome');
                if (munNomeSession) localStorage.setItem('municipio_ativo_nome', munNomeSession);
            }
        } catch(eStorage) {}

        // Verificação de integridade e existência de sessão no carregamento da página
        supabaseClient.auth.getSession().then(({ data, error }) => {
            const isOfflineOrField = (typeof navigator !== 'undefined' && !navigator.onLine) || 
                                     (typeof localStorage !== 'undefined' && localStorage.getItem('geogestor_modo_campo') === 'true');

            if (error || (!data?.session && !isPublicPage)) {
                // Se estiver sem conexão ou em campo, NÃO expulsa para o login se houver dados salvos no aparelho
                if (isOfflineOrField) {
                    console.warn("[Supabase] Dispositivo offline/campo. Mantendo aplicação ativa com dados locais.");
                    return;
                }

                if (!isPublicPage && !data?.session) {
                    sessionStorage.removeItem('municipio_ativo');
                    window.location.href = 'login.html';
                    return;
                }
                if (error && (error.status === 400 || error.message?.toLowerCase().includes('refresh') || error.message?.toLowerCase().includes('token'))) {
                    console.warn("Sessão ou Refresh Token inválido. Limpando credenciais locais expiradas...");
                    try {
                        supabaseClient.auth.signOut({ scope: 'local' });
                        Object.keys(sessionStorage).forEach(key => {
                            if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
                                sessionStorage.removeItem(key);
                            }
                        });
                    } catch(eSignOut) {}

                    if (!isPublicPage) {
                        sessionStorage.removeItem('municipio_ativo');
                        window.location.href = 'login.html?expired=1';
                    }
                }
            }
        }).catch(err => {
            console.warn("Erro ao verificar sessão Supabase (falha de rede transitória):", err);
        });

    } else {
        console.warn("Supabase credentials not set or invalid.");
    }
} catch (e) {
    console.error("Failed to initialize Supabase:", e);
}

if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    window.supabaseClient = supabaseClient;
}

