// main.js - Arquivo Principal
import { db, auth, state, hideLoader, availableMonths } from './config.js';
import * as Admin from './admin-module.js';
import * as Collab from './collab-module.js';
import { updatePersonalView, switchSubTab, renderMonthSelector, updateWeekendTable } from './ui.js'; 
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
        const collabSnap = await getDoc(doc(db, "colaboradores", user.uid));

        state.hasDualRole = (adminSnap.exists() && collabSnap.exists());

        if (state.hasDualRole) {
            state.profile = collabSnap.data(); // Guarda perfil para usar depois
            state.isAdmin = true; // Começa como Admin
            await loadData();
            Admin.initAdminUI();
            renderSwitchModeButton();
        } 
        else if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); 
            Admin.initAdminUI(); 
        } 
        else if (collabSnap.exists()) {
            state.isAdmin = false;
            state.profile = collabSnap.data();
            await loadData(); 
            Collab.initCollabUI(); 
            switchTab('personal');
        } 
        else {
            alert("Usuário sem perfil válido.");
        }
        
        if(state.isAdmin) switchTab('daily');

    } catch (e) { 
        console.error("Erro Fatal:", e); 
        alert("Erro ao iniciar sistema.");
    } finally { 
        hideLoader(); 
    }
});

// --- FUNÇÃO DE ALTERNAR MODO (CORRIGIDA E SEGURA) ---
window.toggleUserMode = async () => {
    const overlay = document.getElementById('appLoadingOverlay');
    overlay.classList.remove('hidden', 'opacity-0');

    try {
        // Inverte o modo
        state.isAdmin = !state.isAdmin;

        // Recarrega a UI correta
        if (state.isAdmin) {
            Admin.initAdminUI();
            switchTab('daily');
            Admin.renderDailyView();
            
            // Restaura seleção anterior se houver
            const sel = document.getElementById('employeeSelect');
            if(sel && sel.value) updatePersonalView(sel.value);
        } else {
            // Modo Colaborador
            if(!state.profile) throw new Error("Perfil de colaborador não encontrado na memória.");
            
            Collab.initCollabUI();
            switchTab('personal');
            
            // Força atualização da visualização pessoal
            updatePersonalView(state.profile.name);
        }
        
        updateWeekendTable(null);
        renderSwitchModeButton(); // Atualiza texto do botão

    } catch (error) {
        console.error("Erro ao trocar de modo:", error);
        alert("Erro ao trocar de visão: " + error.message);
        state.isAdmin = !state.isAdmin; // Reverte mudança em caso de erro
    } finally {
        // Garante que o loader suma SEMPRE
        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 500);
        }, 500);
    }
};

function renderSwitchModeButton() {
    const existingBtn = document.getElementById('btnToggleMode');
    if (existingBtn) existingBtn.remove();

    if (!state.hasDualRole) return;

    const btn = document.createElement('button');
    btn.id = 'btnToggleMode';
    btn.onclick = window.toggleUserMode;
    
    const isNowAdmin = state.isAdmin;
    
    btn.className = `fixed bottom-24 right-6 z-50 px-4 py-3 rounded-full shadow-2xl font-bold text-xs flex items-center gap-2 transition-all hover:scale-105 ${
        isNowAdmin 
        ? 'bg-sky-600 hover:bg-sky-500 text-white border border-sky-400' 
        : 'bg-purple-600 hover:bg-purple-500 text-white border border-purple-400'
    }`;

    btn.innerHTML = isNowAdmin 
        ? '<i class="fas fa-user-astronaut"></i> Ver como Colaborador' 
        : '<i class="fas fa-shield-alt"></i> Ver como Admin';

    document.body.appendChild(btn);
}

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
            const selectedEmp = document.getElementById('employeeSelect');
            if (selectedEmp && selectedEmp.value) {
                updatePersonalView(selectedEmp.value);
            }
        } else {
            if(state.profile) updatePersonalView(state.profile.name);
            Collab.initCollabUI(); 
        }
        updateWeekendTable(null);

        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 500);
        }, 500);
    }
}

function updateMonthSelectorUI() {
    renderMonthSelector(() => handleMonthChange(-1), () => handleMonthChange(1));
}

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};

        // Carrega Cache de Perfis (Se Admin ou Dual)
        if ((state.isAdmin || state.hasDualRole) && !state.employeesCache) {
            const collabSnap = await getDocs(collection(db, "colaboradores"));
            state.employeesCache = {};
            collabSnap.forEach(doc => {
                const data = doc.data();
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
            let userData = state.rawSchedule[name]; 
            
            // Mistura dados de perfil
            if (state.employeesCache && state.employeesCache[name]) {
                userData = { ...state.employeesCache[name], ...userData };
            } 
            else if (state.profile && state.profile.name === name) {
                userData = { ...state.profile, ...userData };
            }

            let finalSchedule = [];

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
                info: userData, 
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
