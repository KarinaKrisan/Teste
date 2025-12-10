// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
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

    const btnSave = document.getElementById('btnSaveCloud');
    if(btnSave) btnSave.onclick = saveToCloud;

    // INJETA O MENU DE AÇÕES RÁPIDAS NA TOOLBAR
    injectQuickActions();

    populateEmployeeSelect();
}

function injectQuickActions() {
    const toolbar = document.querySelector('#adminToolbar > div');
    if (!toolbar || document.getElementById('quickActionsSelect')) return;

    const div = document.createElement('div');
    div.className = "flex flex-col ml-4 border-l border-white/10 pl-4";
    div.innerHTML = `
        <span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Preenchimento Rápido</span>
        <select id="quickActionsSelect" class="bg-[#0F1020] text-xs text-white border border-gray-700 rounded p-1 outline-none focus:border-purple-500">
            <option value="">Aplicar Padrão...</option>
            <option value="5x2">Segunda a Sexta (5x2)</option>
            <option value="clear">Limpar Tudo (Folgas)</option>
            <option value="fill">Marcar Tudo (Trabalho)</option>
        </select>
    `;
    
    // Insere antes dos botões de ação
    toolbar.insertBefore(div, toolbar.lastElementChild);

    document.getElementById('quickActionsSelect').onchange = (e) => {
        const val = e.target.value;
        const empName = document.getElementById('employeeSelect').value;
        
        if (!val) return;
        if (!empName) {
            alert("Selecione um colaborador na lista acima primeiro.");
            e.target.value = "";
            return;
        }

        if(confirm(`Aplicar padrão "${val}" para ${empName}? Isso substituirá o mês inteiro.`)) {
            applyPreset(empName, val);
        }
        e.target.value = ""; // Reseta select
    };
}

// --- LÓGICA DO GERADOR DE ESCALA ---
function applyPreset(name, type) {
    if (!state.rawSchedule[name]) state.rawSchedule[name] = {};
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    const newSchedule = [];

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, d);
        const dayOfWeek = date.getDay(); // 0=Dom, 6=Sab

        let status = 'F';

        if (type === '5x2') {
            // Seg(1) a Sex(5) = T
            if (dayOfWeek >= 1 && dayOfWeek <= 5) status = 'T';
        } 
        else if (type === 'fill') {
            status = 'T';
        }
        // 'clear' já começa como F

        newSchedule.push(status);
    }

    // Salva na memória
    state.rawSchedule[name].calculatedSchedule = newSchedule;
    state.scheduleData[name].schedule = newSchedule;

    // Atualiza visual
    updatePersonalView(name);
    updateWeekendTable(null);
    renderDailyView();
    indicateUnsavedChanges();
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

export function handleAdminCellClick(name, dayIndex) {
    if (!state.rawSchedule[name]) state.rawSchedule[name] = { calculatedSchedule: [] };
    
    // Garante que o array existe
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    if (!state.rawSchedule[name].calculatedSchedule) {
        state.rawSchedule[name].calculatedSchedule = new Array(totalDays).fill('F');
    }

    const currentStatus = state.rawSchedule[name].calculatedSchedule[dayIndex] || 'F';
    const newStatus = prompt(`Dia ${dayIndex + 1} - Novo Status (T, F, FE, A, etc):`, currentStatus);

    if (newStatus === null || newStatus.toUpperCase() === currentStatus) return;

    const formatted = newStatus.toUpperCase();
    state.rawSchedule[name].calculatedSchedule[dayIndex] = formatted;
    
    // Atualiza estado processado também
    if(state.scheduleData[name]) state.scheduleData[name].schedule[dayIndex] = formatted;

    updatePersonalView(name);
    updateWeekendTable(null);
    if (state.currentDay === (dayIndex + 1)) renderDailyView();
    indicateUnsavedChanges();
}

function indicateUnsavedChanges() {
    const saveStatus = document.getElementById('saveStatus');
    const btnSave = document.getElementById('btnSaveCloud');
    
    if (saveStatus) {
        saveStatus.textContent = "Alterações pendentes...";
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

    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    let vacationPills = '';
    const pillBase = "w-full text-center py-2 rounded-full text-xs font-bold border shadow-sm cursor-default";

    Object.keys(state.scheduleData).forEach(name=>{
        const emp = state.scheduleData[name];
        const st = emp.schedule[state.currentDay-1] || 'F';
        
        if(st === 'T') {
            const hours = emp.info.Horário || emp.info.Horario || '';
            if (isWorkingTime(hours)) {
                w++; lists.w += `<div class="${pillBase} bg-green-900/30 text-green-400 border-green-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">T</span></div>`;
            } else {
                os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            }
        }
        else if(st.includes('OFF')) {
             os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
        }
        else if(st === 'FE') {
            v++;
            vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
        }
        else {
            o++;
            lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
        }
    });

    if(document.getElementById('kpiWorking')) {
        document.getElementById('kpiWorking').textContent=w; 
        document.getElementById('kpiOff').textContent=o;
        document.getElementById('kpiVacation').textContent=v; 
        document.getElementById('kpiOffShift').textContent=os;
        
        document.getElementById('listWorking').innerHTML = lists.w;
        document.getElementById('listOffShift').innerHTML = lists.os;
        document.getElementById('listOff').innerHTML = lists.o;
        document.getElementById('listVacation').innerHTML = vacationPills || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém.</span>';
    }
}

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    const statusLabel = document.getElementById('saveStatus');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    btn.disabled = true;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });

        if (statusLabel) {
            statusLabel.textContent = "Sincronizado";
            statusLabel.classList.remove('text-orange-400');
            statusLabel.classList.add('text-gray-300');
        }
        
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
        btn.classList.replace('bg-orange-600', 'bg-indigo-600');
        btn.classList.replace('hover:bg-orange-500', 'hover:bg-indigo-500');
        
        alert("Salvo com sucesso!");
    } catch (e) { 
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar: " + e.message);
        btn.innerHTML = 'Tentar Novamente';
    } finally {
        btn.disabled = false;
    }
}
