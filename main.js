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

    // Renderiza o seletor de mês
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
        console.error("Erro crítico na inicialização:", e); 
        alert("Erro ao carregar sistema. Verifique o console.");
    } finally { 
        // Força o loader a sumir mesmo se houver erros de dados
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
    // ID baseado no nome do documento no Firestore (ex: 2025-12)
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando mês:", docId);
    
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        
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
    // Pega o número de dias do mês selecionado
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
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
            
            // --- CORREÇÃO DO TRAVAMENTO ---
            // Verifica se o array existe. Se não existir (como no seu print do banco), cria um array de 'F' (Folga)
            let rawS = userData.calculatedSchedule || userData.schedule;
            
            if (!Array.isArray(rawS)) {
                 console.warn(`Aviso: ${name} não tem array de escala válido. Gerando array padrão.`);
                 rawS = new Array(totalDays).fill('F');
            }
            
            // Se o array for menor que o mês (ex: salvou em fev e abriu mar), completa
            if (rawS.length < totalDays) {
                const diff = totalDays - rawS.length;
                for(let i=0; i<diff; i++) rawS.push('F');
            }

            state.scheduleData[name] = { 
                info: userData, 
                schedule: rawS 
            };
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
