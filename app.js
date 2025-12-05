// ==========================================
// 4. AUTH & LÓGICA DE PROTEÇÃO DE ROTA
// ==========================================
const adminToolbar = document.getElementById('adminToolbar');
const btnLogout = document.getElementById('btnLogout');
const loadingOverlay = document.getElementById('appLoadingOverlay'); // Vamos criar isso no HTML

// Logout Global
if(btnLogout) btnLogout.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = "start.html"; // Redireciona para a tela inicial
});

onAuthStateChanged(auth, async (user) => {
    // 1. SE NÃO TIVER USUÁRIO LOGADO:
    if (!user) {
        // Redireciona imediatamente para a tela de escolha (start.html)
        // Mas apenas se já não estivermos em uma página de login pública
        const path = window.location.pathname;
        if (!path.includes('start.html') && !path.includes('login-')) {
            window.location.href = "start.html";
        }
        return;
    }

    // 2. SE TIVER USUÁRIO LOGADO:
    // Remove o botão de login da tela (se houver) e libera o acesso
    const loginContainer = document.getElementById('loginButtonsContainer');
    if(loginContainer) loginContainer.classList.add('hidden');

    try {
        // Verificação de Admin
        const adminRef = doc(db, "administradores", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            isAdmin = true;
            if(adminToolbar) adminToolbar.classList.remove('hidden');
            document.getElementById('adminEditHint')?.classList.remove('hidden');
            document.body.style.paddingBottom = "100px";
            initAdminRequestsListener();
            console.log("Admin Connect");
        } else {
            isAdmin = false;
            if(adminToolbar) adminToolbar.classList.add('hidden');
            document.getElementById('adminEditHint')?.classList.add('hidden');
            console.log("Colaborador Connect");
        }
    } catch (e) {
        console.error("Auth check error:", e);
        isAdmin = false;
    } finally {
        // Remove a tela de carregamento para mostrar o painel
        if(loadingOverlay) {
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
        }
    }
    
    // Carrega os dados somente se estiver logado
    updateDailyView();
});
