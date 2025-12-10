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
        // Tenta carregar perfil de Admin
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); 
            Admin.initAdminUI(); 
            switchTab('daily');
        } else {
            // Tenta carregar perfil de Colaborador
            const collabSnap = await getDoc(doc(db, "colaboradores", user.uid));
            if (collabSnap.exists()) {
                state.isAdmin = false;
                state.profile = collabSnap.data();
                await loadData(); 
                Collab.initCollabUI(); 
                switchTab('personal');
            } else {
                alert("Acesso Negado: Usuário sem perfil de colaborador ou admin.");
            }
        }
    } catch (e) { 
        console.error("Erro crítico na inicialização:", e); 
        alert("Ocorreu um erro ao carregar os dados. Verifique o console (F12) para detalhes.");
    } finally { 
        // Remove a tela de carregamento em QUALQUER situação
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
        
        // Mostra loader
        const overlay = document.getElementById('appLoadingOverlay');
        overlay.classList.remove('hidden', 'opacity-0');
        
        updateMonthSelectorUI();
        await loadData();

        // Atualiza UI
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

        // Esconde loader
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
    // Define o ID do documento (ex: 2025-12)
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando escala do mês:", docId);
    
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        
        if (!snap.exists()) {
            console.warn(`Escala ${docId} não encontrada no banco. Iniciando vazio.`);
            state.scheduleData = {};
        } else {
            processScheduleData();
        }
        
    } catch (e) { 
        console.error("Erro em loadData:", e); 
        state.scheduleData = {}; // Evita quebrar a UI
    }
}

function processScheduleData() {
    state.scheduleData = {};
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    const slider = document.getElementById('dateSlider');
    if (slider) { 
        slider.max = totalDays; 
        if (state.currentDay > totalDays) state.currentDay = totalDays;
        slider.value = state.currentDay; 
    }

    if(state.rawSchedule) {
        Object.keys(state.rawSchedule).forEach(name => {
            const userData = state.rawSchedule[name];
            
            // --- PROTEÇÃO CONTRA FORMATO INCORRETO DO BANCO ---
            // Tenta pegar o array de dias. Se não existir (porque o banco tem formato antigo), cria um array vazio.
            let rawS = userData.calculatedSchedule || userData.schedule;
            
            if (!Array.isArray(rawS)) {
                 console.warn(`Corrigindo dados para: ${name}. Criando escala padrão vazia.`);
                 rawS = new Array(totalDays).fill('F');
            }
            
            // Se o array existir mas for curto, completa com 'F'
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
