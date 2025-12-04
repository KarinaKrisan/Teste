// =========================================================
// ATUALIZAÇÃO NO app.js - Substitua as funções abaixo
// =========================================================

// 1. Nova função auxiliar para limpar strings (Normalização Forte)
function normalizeString(str) {
    if (!str) return "";
    return str
        .normalize("NFD") // Separa acentos das letras
        .replace(/[\u0300-\u036f]/g, "") // Remove os acentos
        .toLowerCase() // Tudo minúsculo
        .replace(/[^a-z0-9]/g, ""); // Remove TUDO que não for letra ou número (pontos, espaços, traços)
}

// 2. Função resolveCollaboratorName Aprimorada
function resolveCollaboratorName(email) {
    if(!email) return "Colaborador";
    
    // Pega a parte antes do @ (ex: karina.krisan)
    const prefix = email.split('@')[0];
    
    // Normaliza o prefixo do email (ex: vira "karinakrisan")
    const normalizedPrefix = normalizeString(prefix);

    // Se temos dados de escala carregados, procuramos um match real
    if (Object.keys(scheduleData).length > 0) {
        // Percorre todas as chaves (nomes) da escala (ex: "Karina Krisan", "João Silva")
        const matchKey = Object.keys(scheduleData).find(dbKey => {
            // Normaliza o nome que está no banco (ex: "Karina Krisan" vira "karinakrisan")
            const normalizedDbKey = normalizeString(dbKey);
            
            // COMPARAÇÃO BLINDADA: "karinakrisan" === "karinakrisan"
            // Isso resolve: pontos, espaços, maiúsculas e nomes juntos/separados
            return normalizedDbKey === normalizedPrefix || normalizedDbKey.includes(normalizedPrefix);
        });

        if (matchKey) {
            console.log(`✅ Match encontrado: Email (${prefix}) -> Banco (${matchKey})`);
            return matchKey; // Retorna o nome exato como está no banco para carregar a escala
        }
    }
    
    // Fallback: Se não achar, formata o nome bonito para exibição
    console.log(`⚠️ Match não encontrado na escala para: ${prefix}. Usando formatação padrão.`);
    return prefix.replace(/\./g, ' ').split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

// 3. Função setupCollabMode Atualizada
// Garante que o select seja preenchido e disparado automaticamente
function setupCollabMode(name) {
    isAdmin = false;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); 
    
    adminToolbar.classList.add('hidden');
    collabToolbar.classList.remove('hidden');
    
    document.getElementById('collabNameDisplay').textContent = name;
    document.getElementById('collabEditHint').classList.remove('hidden');
    document.getElementById('adminEditHint').classList.add('hidden');
    document.body.style.paddingBottom = "100px";

    // COLABORADOR NÃO VÊ A VISÃO DIÁRIA
    if(dailyTabBtn) dailyTabBtn.classList.add('hidden');

    // Auto-select na view pessoal
    const empSelect = document.getElementById('employeeSelect');
    if(empSelect) {
        // Popula as opções se ainda não estiverem populadas (caso o initSelect não tenha rodado)
        if (empSelect.options.length <= 1 && Object.keys(scheduleData).length > 0) {
             Object.keys(scheduleData).sort().forEach(key => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = key;
                empSelect.appendChild(opt);
            });
        }

        // Tenta selecionar o valor exato
        empSelect.value = name;
        
        // Dispara evento para carregar a escala visualmente
        empSelect.dispatchEvent(new Event('change'));

        // Opcional: Desabilitar o select para que o colaborador veja apenas a dele
        // empSelect.disabled = true; 
    }

    // Força ir para a tab pessoal
    const personalTab = document.querySelector('[data-tab="personal"]');
    if(personalTab) personalTab.click();
    
    startRequestsListener();
}

// 4. Atualize o trecho dentro de loadDataFromCloud
// Isso é crucial porque os dados chegam DEPOIS do login
async function loadDataFromCloud() {
    // ... (seu código de definição do docId) ...
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            updateDailyView();
            initSelect(); // Popula o dropdown
            
            // --- LÓGICA DE RE-RESOLUÇÃO (ATUALIZADA) ---
            const user = auth.currentUser;
            if (user && !isAdmin && user.email) {
                // Agora que temos os dados, tentamos resolver o nome novamente
                const betterName = resolveCollaboratorName(user.email);
                
                // Atualiza o estado global
                currentUserCollab = betterName;
                
                // Força a atualização da tela do colaborador com o nome encontrado
                setupCollabMode(currentUserCollab);
            }
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
    } catch (e) {
        console.error("Erro ao baixar dados:", e);
    }
}
