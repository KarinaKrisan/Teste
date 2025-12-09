// main.js - Arquivo Principal
import { db, auth, state, hideLoader } from './config.js';
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

    // Inicializa Seletor de Mês
    renderMonthSelector(async (newMonthObj) => {
        const btnLoad = document.querySelector('select'); 
        if(btnLoad) btnLoad.disabled = true;
        
        state.selectedMonthObj = newMonthObj;
        state.currentDay = 1; 
        
        await loadData();
        reloadCurrentView();
        
        if(btnLoad) btnLoad.disabled = false;
    });

    try {
        // Tenta Admin
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); 
            Admin.initAdminUI();
            
            // [CORREÇÃO] Renderiza a visão diária imediatamente após carregar
            Admin.renderDailyView(); 
            
            switchTab('daily');
        } else {
            // Tenta Colab
            const collabSnap = await getDoc(doc(db, "colaboradores", user.uid));
            if (collabSnap.exists()) {
                state.isAdmin = false;
                state.profile = collabSnap.data();
                await loadData(); 
                Collab.initCollabUI(); 
                switchTab('personal');
            } else {
                alert("Usuário sem perfil!");
            }
        }
    } catch (e) { 
        console.error(e); 
        alert("Erro ao carregar sistema. Verifique o console.");
    } finally { 
        hideLoader(); 
    }
});

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // Limpa dados antigos
    state.rawSchedule = {};
    state.scheduleData = {};

    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        processScheduleData();
    } catch (e) { console.error("Erro loadData:", e); }
}

function processScheduleData() {
    state.scheduleData = {};
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    // Atualiza Slider
    const slider = document.getElementById('dateSlider');
    if (slider) { 
        slider.max = totalDays; 
        if(state.currentDay > totalDays) state.currentDay = 1;
        slider.value = state.currentDay; 
    }

    if(state.rawSchedule && Object.keys(state.rawSchedule).length > 0) {
        Object.keys(state.rawSchedule).forEach(name => {
            let s = state.rawSchedule[name].calculatedSchedule || new Array(totalDays).fill('F');
            state.scheduleData[name] = { info: state.rawSchedule[name], schedule: s };
        });
    }
}

function reloadCurrentView() {
    if(state.isAdmin) {
        Admin.renderDailyView();
        const select = document.getElementById('employeeSelect');
        if(select && select.value) {
            updatePersonalView(select.value);
        }
        Admin.populateEmployeeSelect(); 
        updateWeekendTable(null);
    } else {
        updatePersonalView(state.profile.name);
        updateWeekendTable(null); 
        Collab.initCollabUI();
    }
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
