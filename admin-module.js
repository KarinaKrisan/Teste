// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
// Importação correta do Firestore
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    const hint = document.getElementById('adminEditHint');
    
    if(toolbar) toolbar.classList.remove('hidden');
    if(hint) hint.classList.remove('hidden');
    document.body.style.paddingBottom = "120px";

    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    document.getElementById('employeeSelectContainer').classList.remove('hidden');

    // SETUP MODAIS
    const btnConfirmEdit = document.getElementById('btnAdminConfirm');
    const btnCancelEdit = document.getElementById('btnAdminCancel');
    if(btnConfirmEdit) btnConfirmEdit.onclick = confirmAdminEdit;
    if(btnCancelEdit) btnCancelEdit.onclick = closeAdminModal;

    const btnOpenSave = document.getElementById('btnOpenSaveModal');
    const btnConfirmSave = document.getElementById('btnSaveConfirm');
    const btnCancelSave = document.getElementById('btnSaveCancel');

    if(btnOpenSave) btnOpenSave.onclick = openSaveModal;
    if(btnConfirmSave) btnConfirmSave.onclick = confirmSaveToCloud; // Conecta a função de salvar
    if(btnCancelSave) btnCancelSave.onclick = closeSaveModal;

    populateEmployeeSelect();
}

export function populateEmployeeSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    s.innerHTML = '<option value="">Selecione um colaborador...</option>';
    if (!state.scheduleData) return;

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

// --- MODAL DE EDIÇÃO ---
export function handleAdminCellClick(name, dayIndex) {
    if (!state.rawSchedule[name]) state.rawSchedule[name] = {};
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    if (!state.rawSchedule[name].calculatedSchedule) {
        state.rawSchedule[name].calculatedSchedule = state.scheduleData[name]?.schedule || new Array(totalDays).fill('F');
    }

    const currentStatus = state.rawSchedule[name].calculatedSchedule[dayIndex] || 'F';

    document.getElementById('adminModalSubtext').textContent = `${name} • Dia ${dayIndex + 1}`;
    const input = document.getElementById('adminEditInput');
    input.value = currentStatus;
    
    document.getElementById('adminEditName').value = name;
    document.getElementById('adminEditIndex').value = dayIndex;

    document.getElementById('adminEditModal').classList.remove('hidden');
    input.focus();
    input.select();
}

function confirmAdminEdit() {
    const name = document.getElementById('adminEditName').value;
    const dayIndex = parseInt(document.getElementById('adminEditIndex').value);
    const newStatus = document.getElementById('adminEditInput').value.toUpperCase().trim();
    
    if (!newStatus) { alert("Digite um status."); return; }

    // Atualiza Memória
    state.rawSchedule[name].calculatedSchedule[dayIndex] = newStatus;
    
    if(state.scheduleData[name] && state.scheduleData[name].schedule) {
        state.scheduleData[name].schedule[dayIndex] = newStatus;
    }

    updatePersonalView(name);     
    updateWeekendTable(null);     
    if (state.currentDay === (dayIndex + 1)) renderDailyView();

    indicateUnsavedChanges();
    closeAdminModal();
}

function closeAdminModal() {
    document.getElementById('adminEditModal').classList.add('hidden');
}

// --- MODAL DE SALVAR (AQUI ESTÁ A CORREÇÃO PRINCIPAL) ---
function openSaveModal() {
    document.getElementById('adminSaveModal').classList.remove('hidden');
}

function closeSaveModal() {
    document.getElementById('adminSaveModal').classList.add('hidden');
}

async function confirmSaveToCloud() {
    const btnConfirm = document.getElementById('btnSaveConfirm');
    const originalText = btnConfirm.innerHTML;
    
    // Feedback de Loading
    btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btnConfirm.disabled = true;

    // ID CORRETO: Sem prefixo "escala-", apenas YYYY-MM
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Salvando em:", docId); // Debug no console

    try {
        // Envia para o Firestore
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });
        
        // Sucesso
        closeSaveModal();
        
        // Mostra o modal de sucesso do sistema (se tiver) ou alerta nativo
        // Aqui mantemos o alerta nativo ou toast simples para garantir feedback
        alert("Dados salvos com sucesso no banco de dados!"); 
        
        // Reseta UI da Toolbar para "Sincronizado"
        const statusLabel = document.getElementById('saveStatus');
        const btnToolbar = document.getElementById('btnOpenSaveModal');
        
        if (statusLabel) {
            statusLabel.textContent = "Sincronizado";
            statusLabel.classList.remove('text-orange-400');
            statusLabel.classList.add('text-gray-300');
        }
        if (btnToolbar) {
            btnToolbar.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
            btnToolbar.classList.replace('bg-orange-600', 'bg-indigo-600');
            btnToolbar.classList.replace('hover:bg-orange-500', 'hover:bg-indigo-500');
        }

    } catch (e) { 
        console.error("Erro crítico ao salvar:", e);
        alert("ERRO AO SALVAR: " + e.message + "\nVerifique sua conexão e permissões.");
    } finally {
        btnConfirm.innerHTML = originalText;
        btnConfirm.disabled = false;
    }
}

function indicateUnsavedChanges() {
    const saveStatus = document.getElementById('saveStatus');
    const btnToolbar = document.getElementById('btnOpenSaveModal');
    
    if (saveStatus) {
        saveStatus.textContent = "Alteração Pendente";
        saveStatus.classList.add('text-orange-400');
        saveStatus.classList.remove('text-gray-300');
    }
    if (btnToolbar) {
        btnToolbar.innerHTML = '<i class="fas fa-exclamation-circle mr-2"></i> Salvar Agora';
        btnToolbar.classList.replace('bg-indigo-600', 'bg-orange-600');
        btnToolbar.classList.replace('hover:bg-indigo-500', 'hover:bg-orange-500');
    }
}

// --- VISÃO DIÁRIA ---
export function renderDailyView() {
    const dateLabel = document.getElementById('currentDateLabel');
    if(dateLabel) {
        const d = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, state.currentDay);
        if (!isNaN(d.getTime())) {
            dateLabel.textContent = `${daysOfWeek[d.getDay()]}, ${pad(state.currentDay)}/${pad(state.selectedMonthObj.month+1)}`;
        }
    }
    
    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    let vacationPills = '';
    const pillBase = "w-full text-center py-2 rounded-full text-xs font-bold border shadow-sm cursor-default";

    if (state.scheduleData) {
        Object.keys(state.scheduleData).forEach(name => {
            const emp = state.scheduleData[name];
            if (!emp || !emp.schedule) return;
            const st = emp.schedule[state.currentDay-1] || 'F';
            
            if(st === 'T') {
                const hours = (emp.info && (emp.info.Horário || emp.info.Horario)) || '';
                if (isWorkingTime(hours)) {
                    w++; lists.w += `<div class="${pillBase} bg-green-900/30 text-green-400 border-green-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">T</span></div>`;
                } else {
                    os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
                }
            } else if(st.includes('OFF')) {
                 os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            } else if(st === 'FE' || st === 'FÉRIAS') {
                v++; vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
            } else {
                o++; lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
            }
        });
    }

    if(document.getElementById('kpiWorking')) {
        document.getElementById('kpiWorking').textContent = w; 
        document.getElementById('kpiOff').textContent = o;
        document.getElementById('kpiVacation').textContent = v; 
        document.getElementById('kpiOffShift').textContent = os;
        
        document.getElementById('listWorking').innerHTML = lists.w;
        document.getElementById('listOffShift').innerHTML = lists.os;
        document.getElementById('listOff').innerHTML = lists.o;
        document.getElementById('listVacation').innerHTML = vacationPills || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém.</span>';
    }
}
