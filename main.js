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

// Slider de data (Visão Diária)
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

    // Renderiza o seletor de mês pela primeira vez
    updateMonthSelectorUI();

    try {
        // Tenta Admin
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); 
            Admin.initAdminUI(); 
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

// --- LÓGICA DE TROCA DE MÊS ---
async function handleMonthChange(direction) {
    const currentIndex = availableMonths.findIndex(
        m => m.year === state.selectedMonthObj.year && m.month === state.selectedMonthObj.month
    );

    const newIndex = currentIndex + direction;

    // Verifica se existe mês anterior ou próximo
    if (newIndex >= 0 && newIndex < availableMonths.length) {
        // 1. Atualiza Estado
        state.selectedMonthObj = availableMonths[newIndex];
        
        // 2. Feedback Visual
        const overlay = document.getElementById('appLoadingOverlay');
        overlay.classList.remove('hidden', 'opacity-0');
        
        // 3. Atualiza Seletor
        updateMonthSelectorUI();

        // 4. Carrega Novos Dados
        await loadData();

        // 5. Atualiza Interface Específica
        if (state.isAdmin) {
            Admin.renderDailyView();
            // Se tiver alguém selecionado no select, atualiza a visão dele
            const selectedEmp = document.getElementById('employeeSelect').value;
            if (selectedEmp) {
                updatePersonalView(selectedEmp);
                updateWeekendTable(null);
            }
        } else {
            // Colaborador
            updatePersonalView(state.profile.name);
            updateWeekendTable(null);
            // Se a aba de trocas estiver ativa, recarrega
            Collab.initCollabUI(); 
        }

        // Esconde loading
        setTimeout(() => {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 500);
        }, 500);
    }
}

function updateMonthSelectorUI() {
    renderMonthSelector(
        () => handleMonthChange(-1), // Prev
        () => handleMonthChange(1)   // Next
    );
}

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando mês:", docId);
    
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        
        // Se o mês não existe no banco, limpa os dados da memória
        if (!snap.exists()) {
            console.warn("Nenhum dado encontrado para", docId);
            state.scheduleData = {};
        } else {
            processScheduleData();
        }
        
    } catch (e) { 
        console.error("Erro loadData:", e); 
        state.scheduleData = {};
    }
}

function processScheduleData() {
    state.scheduleData = {};
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    // Atualiza slider da Home para o limite do novo mês
    const slider = document.getElementById('dateSlider');
    if (slider) { 
        slider.max = totalDays; 
        if (state.currentDay > totalDays) state.currentDay = totalDays; // Corrige se o dia selecionado for 31 e o mês tiver 30
        slider.value = state.currentDay; 
    }

    if(state.rawSchedule) {
        Object.keys(state.rawSchedule).forEach(name => {
            let s = state.rawSchedule[name].calculatedSchedule || new Array(totalDays).fill('F');
            state.scheduleData[name] = { info: state.rawSchedule[name], schedule: s };
        });
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

// EXPOR FUNÇÕES GLOBAIS
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
