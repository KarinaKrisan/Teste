// main.js - Arquivo Principal
import { db, auth, state, hideLoader, availableMonths } from './config.js';
import * as Admin from './admin-module.js';
import * as Collab from './collab-module.js';
import { updatePersonalView, switchSubTab, renderMonthSelector, updateWeekendTable } from './ui.js'; 
// ADICIONADO: collection e getDocs para ler os perfis
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// --- INICIALIZAÇÃO ---
const btnLogout = document.getElementById('btnLogout');
if(btnLogout) {
    btnLogout.addEventListener('click', async () => { 
        await signOut(auth); 
        window.location.href = "start.html"; 
    });
}

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

    updateMonthSelectorUI();

    try {
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); // Agora carrega perfis também
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
                alert("Usuário sem perfil válido.");
            }
        }
    } catch (e) { 
        console.error("Erro Fatal:", e); 
        alert("Erro ao iniciar sistema.");
    } finally { 
        hideLoader(); 
    }
});

// --- LÓGICA DE NAVEGAÇÃO ---
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
    renderMonthSelector(() => handleMonthChange(-1), () => handleMonthChange(1));
}

// --- CARREGAMENTO DE DADOS (ATUALIZADO) ---
async function loadData() {
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando mês:", docId);
    
    try {
        // 1. Carrega a Escala do Mês
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        if (!snap.exists()) console.warn("Mês sem dados de escala.");

        // 2. Carrega PERFIS (Célula, Turno, Horário) se for Admin
        if (state.isAdmin && !state.employeesCache) {
            console.log("Carregando banco de perfis...");
            const collabSnap = await getDocs(collection(db, "colaboradores"));
            state.employeesCache = {};
            collabSnap.forEach(doc => {
                const data = doc.data();
                // Usa o nome como chave para facilitar busca
                if(data.name) state.employeesCache[data.name] = data;
            });
        }

        processScheduleData();
        
    } catch (e) { 
        console.error("Erro loadData:", e); 
        state.scheduleData = {}; 
    }
}

function processScheduleData() {
    state.scheduleData = {};
    const year = state.selectedMonthObj.year;
    const month = state.selectedMonthObj.month;
    const totalDays = new Date(year, month+1, 0).getDate();
    
    const slider = document.getElementById('dateSlider');
    if (slider) { slider.max = totalDays; slider.value = state.currentDay; }

    if(state.rawSchedule) {
        Object.keys(state.rawSchedule).forEach(name => {
            let userData = state.rawSchedule[name]; // Dados do mês (só tem T/F)
            
            // --- MISTURA DADOS: Pega info extra do Perfil (employeesCache) ---
            if (state.isAdmin && state.employeesCache && state.employeesCache[name]) {
                // Combina os dados do mês com os dados fixos do perfil (Célula, Turno, etc)
                userData = { ...state.employeesCache[name], ...userData };
            } 
            // Se for Colaborador logado, usa o próprio perfil
            else if (!state.isAdmin && state.profile && state.profile.name === name) {
                userData = { ...state.profile, ...userData };
            }

            let finalSchedule = [];

            // Lógica de Escala (Híbrida)
            if (userData.calculatedSchedule && Array.isArray(userData.calculatedSchedule)) {
                finalSchedule = userData.calculatedSchedule;
            } 
            else if (userData.schedule && Array.isArray(userData.schedule)) {
                finalSchedule = userData.schedule;
            }
            else {
                finalSchedule = generateScheduleFromRules(userData, year, month, totalDays);
            }

            if (finalSchedule.length < totalDays) {
                const diff = totalDays - finalSchedule.length;
                for(let i=0; i<diff; i++) finalSchedule.push('F');
            }

            state.scheduleData[name] = { 
                info: userData, // Agora contém Célula/Turno vindo do perfil
                schedule: finalSchedule 
            };
        });
    }
}

function generateScheduleFromRules(data, year, month, totalDays) {
    const arr = [];
    const ruleT = (data.T && typeof data.T === 'string') ? data.T.toLowerCase() : "";
    const ruleF = (data.F && typeof data.F === 'string') ? data.F.toLowerCase() : "";

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay(); 

        let status = 'F'; 
        if (ruleT.includes("segunda a sexta") || ruleT.includes("segunda à sexta")) {
            if (dayOfWeek >= 1 && dayOfWeek <= 5) status = 'T';
        }
        if (ruleF.includes("fins de semana") || ruleF.includes("fim de semana")) {
            if (dayOfWeek === 0 || dayOfWeek === 6) status = 'F';
        }
        arr.push(status);
    }
    return arr;
}

// UTILS
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
