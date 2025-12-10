// main.js - Arquivo Principal
import { db, auth, state, hideLoader, availableMonths } from './config.js';
import * as Admin from './admin-module.js';
import * as Collab from './collab-module.js';
import { updatePersonalView, switchSubTab, renderMonthSelector, updateWeekendTable } from './ui.js'; 
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// --- INICIALIZAÇÃO ---
const btnLogout = document.getElementById('btnLogout');
if(btnLogout) {
    btnLogout.addEventListener('click', async () => { 
        await signOut(auth); 
        window.location.href = "start.html"; 
    });
}

// Slider de data
const ds = document.getElementById('dateSlider');
if (ds) ds.addEventListener('input', e => { 
    state.currentDay = parseInt(e.target.value); 
    if(state.isAdmin) Admin.renderDailyView(); 
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('start.html') && 
            !window.location.pathname.includes('login-')) {
            window.location.href = "start.html";
        }
        return;
    }
    state.currentUser = user;

    // Renderiza o seletor de mês inicial
    updateMonthSelectorUI();

    try {
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); 
            Admin.initAdminUI(); 
            switchTab('daily');
        } else {
            const collabSnap = await getDoc(doc(db, "colaboradores", user.uid));
            if (collabSnap.exists()) {
                state.isAdmin = false;
                state.profile = collabSnap.data();
                await loadData(); 
                Collab.initCollabUI(); 
                switchTab('personal');
            } else {
                alert("Acesso Negado: Usuário sem perfil.");
            }
        }
    } catch (e) { 
        console.error("Erro crítico:", e); 
        alert("Erro ao carregar sistema. Verifique o console.");
    } finally { 
        hideLoader(); 
    }
});

// --- LÓGICA DE TROCA DE MÊS ---
async function handleMonthChange(direction) {
    const currentIndex = availableMonths.findIndex(
        m => m.year === state.selectedMonthObj.year && m.month === state.selectedMonthObj.month
    );

    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < availableMonths.length) {
        state.selectedMonthObj = availableMonths[newIndex];
        
        const overlay = document.getElementById('appLoadingOverlay');
        overlay.classList.remove('hidden', 'opacity-0');
        
        updateMonthSelectorUI();
        await loadData();

        if (state.isAdmin) {
            Admin.renderDailyView();
            const selectedEmp = document.getElementById('employeeSelect').value;
            if (selectedEmp) {
                updatePersonalView(selectedEmp);
                updateWeekendTable(null);
            }
        } else {
            updatePersonalView(state.profile.name);
            updateWeekendTable(null);
            Collab.initCollabUI(); 
        }

        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 500);
        }, 500);
    }
}

function updateMonthSelectorUI() {
    renderMonthSelector(
        () => handleMonthChange(-1), 
        () => handleMonthChange(1)
    );
}

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    // ID baseado no formato do seu banco: YYYY-MM (ex: 2025-11)
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Lendo documento:", docId);
    
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        
        if (!snap.exists()) {
            console.warn(`Documento ${docId} não encontrado.`);
            state.scheduleData = {};
        } else {
            processScheduleData();
        }
        
    } catch (e) { 
        console.error("Erro no loadData:", e); 
        state.scheduleData = {}; 
    }
}

function processScheduleData() {
    state.scheduleData = {};
    const year = state.selectedMonthObj.year;
    const month = state.selectedMonthObj.month; // 0-11
    const totalDays = new Date(year, month+1, 0).getDate();
    
    // Configura o slider
    const slider = document.getElementById('dateSlider');
    if (slider) { 
        slider.max = totalDays; 
        if (state.currentDay > totalDays) state.currentDay = totalDays;
        slider.value = state.currentDay; 
    }

    if(state.rawSchedule) {
        Object.keys(state.rawSchedule).forEach(name => {
            const userData = state.rawSchedule[name];
            let finalSchedule = [];

            // 1. TENTA LER A LISTA PRONTA (Se já foi salvo pelo Admin novo)
            if (userData.calculatedSchedule && Array.isArray(userData.calculatedSchedule)) {
                finalSchedule = userData.calculatedSchedule;
            } 
            else if (userData.schedule && Array.isArray(userData.schedule)) {
                finalSchedule = userData.schedule;
            }
            // 2. SE NÃO TIVER LISTA, TENTA "TRADUZIR" AS REGRAS DO BANCO (2025-11)
            else {
                console.log(`Gerando escala baseada em regras para: ${name}`);
                finalSchedule = generateScheduleFromRules(userData, year, month, totalDays);
            }

            // Garante que o array tenha o tamanho certo
            if (finalSchedule.length < totalDays) {
                const diff = totalDays - finalSchedule.length;
                for(let i=0; i<diff; i++) finalSchedule.push('F');
            }

            state.scheduleData[name] = { 
                info: userData, 
                schedule: finalSchedule 
            };
        });
    }
}

// --- FUNÇÃO DE TRADUÇÃO DE REGRAS (NOVA) ---
function generateScheduleFromRules(data, year, month, totalDays) {
    const arr = [];
    // Normaliza os textos do banco para minúsculas para facilitar a comparação
    const ruleT = data.T ? data.T.toLowerCase() : "";
    const ruleF = data.F ? data.F.toLowerCase() : "";

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay(); // 0 = Domingo, 6 = Sábado

        let status = 'F'; // Status padrão

        // Lógica para "Segunda a Sexta"
        if (ruleT.includes("segunda a sexta") || ruleT.includes("segunda à sexta")) {
            if (dayOfWeek >= 1 && dayOfWeek <= 5) status = 'T';
        }

        // Lógica para "Fins de Semana" (sobrescreve se necessário)
        if (ruleF.includes("fins de semana") || ruleF.includes("fim de semana")) {
            if (dayOfWeek === 0 || dayOfWeek === 6) status = 'F';
        }
        
        // Se no banco 2025-12 as chaves existirem mas estiverem vazias, assume F padrão
        // Se houver lógica específica para T ou F que não seja texto, adicione aqui.

        arr.push(status);
    }
    return arr;
}

// --- UTILS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if(btn) btn.classList.add('active');
    
    const view = document.getElementById(`${tabName}View`);
    if(view) view.classList.remove('hidden');
}

document.querySelectorAll('.tab-button').forEach(b => {
    b.addEventListener('click', () => {
        if(!state.isAdmin && b.dataset.tab === 'daily') return;
        switchTab(b.dataset.tab);
    });
});

window.handleCellClick = (name, dayIndex) => {
    if(state.isAdmin) {
        Admin.handleAdminCellClick(name, dayIndex);
    } else {
        import('./collab-module.js').then(module => {
            module.handleCollabCellClick(name, dayIndex);
        });
    }
};

window.switchSubTab = switchSubTab;
