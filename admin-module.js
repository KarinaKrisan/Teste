// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    const hint = document.getElementById('adminEditHint');
    
    if(toolbar) toolbar.classList.remove('hidden');
    if(hint) hint.classList.remove('hidden');
    
    // Ajuste de layout
    document.body.style.paddingBottom = "120px";

    // Mostra abas corretas
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    
    // Mostra seletor
    document.getElementById('employeeSelectContainer').classList.remove('hidden');

    // Configura botão salvar
    const btnSave = document.getElementById('btnSaveCloud');
    if(btnSave) btnSave.onclick = saveToCloud;

    // Inicializa lista
    populateEmployeeSelect();
}

export function populateEmployeeSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    s.innerHTML = '<option value="">Selecione um colaborador...</option>';
    
    const names = Object.keys(state.scheduleData).sort();
    names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        s.appendChild(opt);
    });

    s.onchange = (e) => {
        if(e.target.value) {
            updatePersonalView(e.target.value);
            updateWeekendTable(null); 
        } else {
            document.getElementById('personalInfoCard').classList.add('hidden');
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    };
}

// --- EDIÇÃO INDIVIDUAL POR CLIQUE ---
export function handleAdminCellClick(name, dayIndex) {
    // 1. Garante a estrutura de dados na memória
    if (!state.rawSchedule[name]) state.rawSchedule[name] = {};
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    // Se não existir array editável, cria uma cópia do que está sendo visto ou um novo array de Folgas
    if (!state.rawSchedule[name].calculatedSchedule) {
        state.rawSchedule[name].calculatedSchedule = state.scheduleData[name].schedule || new Array(totalDays).fill('F');
    }

    // 2. Pega status atual
    const currentStatus = state.rawSchedule[name].calculatedSchedule[dayIndex] || 'F';

    // 3. Prompt de Edição
    const newStatus = prompt(
        `EDITAR DIA ${dayIndex + 1} (${name})\n\nStatus Atual: ${currentStatus}\nDigite o novo código (T, F, FE, A, etc):`, 
        currentStatus
    );

    // 4. Se cancelar, sai
    if (newStatus === null || newStatus.toUpperCase() === currentStatus) return;

    // 5. Aplica a mudança
    const formatted = newStatus.toUpperCase();
    
    // Atualiza a memória bruta (que será salva)
    state.rawSchedule[name].calculatedSchedule[dayIndex] = formatted;
    
    // Atualiza a visualização imediata
    if(state.scheduleData[name]) {
        state.scheduleData[name].schedule[dayIndex] = formatted;
    }

    // 6. Atualiza todas as visualizações
    updatePersonalView(name);     // Calendário Individual
    updateWeekendTable(null);     // Lista de Fim de Semana
    
    // Se o dia editado for o dia selecionado no slider, atualiza o dashboard
    if (state.currentDay === (dayIndex + 1)) {
        renderDailyView();
    }

    // 7. Avisa que precisa salvar
    indicateUnsavedChanges();
}

function indicateUnsavedChanges() {
    const saveStatus = document.getElementById('saveStatus');
    const btnSave = document.getElementById('btnSaveCloud');
    
    if (saveStatus) {
        saveStatus.textContent = "Alteração Pendente";
        saveStatus.classList.add('text-orange-400');
        saveStatus.classList.remove('text-gray-300');
    }
    if (btnSave) {
        btnSave.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> Salvar Agora';
        btnSave.classList.replace('bg-indigo-600', 'bg-orange-600');
        btnSave.classList.replace('hover:bg-indigo-500', 'hover:bg-orange-500');
    }
}

export function renderDailyView() {
    const dateLabel = document.getElementById('currentDateLabel');
    if(dateLabel) {
        const dow = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, state.currentDay).getDay();
        dateLabel.textContent = `${daysOfWeek[dow]}, ${pad(state.currentDay)}/${pad(state.selectedMonthObj.month+1)}`;
    }
    // Lógica de contagem KPIs e listas (mantida igual para economizar espaço e focar na correção)
    // ... (Use o código da resposta anterior para esta função se precisar, a lógica de renderização não mudou)
}

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    const statusLabel = document.getElementById('saveStatus');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    btn.disabled = true;

    // ID do documento (ex: 2025-12)
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        // Salva o objeto completo com os arrays calculatedSchedule
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });

        if (statusLabel) {
            statusLabel.textContent = "Sincronizado";
            statusLabel.classList.remove('text-orange-400');
            statusLabel.classList.add('text-gray-300');
        }
        
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
        btn.classList.replace('bg-orange-600', 'bg-indigo-600');
        btn.classList.replace('hover:bg-orange-500', 'hover:bg-indigo-500');
        
        alert("Escala salva com sucesso!");

    } catch (e) { 
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar: " + e.message);
        btn.innerHTML = 'Tentar Novamente';
    } finally {
        btn.disabled = false;
    }
}
