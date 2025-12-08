// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './main.js';

export function initAdminUI() {
    document.getElementById('adminToolbar').classList.remove('hidden');
    document.getElementById('adminEditHint').classList.remove('hidden');
    document.body.style.paddingBottom = "100px";

    // Mostra abas corretas
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    
    // Mostra Select
    document.getElementById('employeeSelectContainer').classList.remove('hidden');

    // Botão Salvar
    const btnSave = document.getElementById('btnSaveCloud');
    if(btnSave) btnSave.onclick = saveToCloud;

    // Inicializa Select
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
            // Admin vê escala individual E todos os plantões
            updatePersonalView(e.target.value);
            updateWeekendTable(null); 
        } else {
            document.getElementById('personalInfoCard').classList.add('hidden');
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    };
}

export function renderDailyView() {
    // Atualiza Data Header
    const dateLabel = document.getElementById('currentDateLabel');
    if(dateLabel) {
        const dow = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, state.currentDay).getDay();
        dateLabel.textContent = `${daysOfWeek[dow]}, ${pad(state.currentDay)}/${pad(state.selectedMonthObj.month+1)}`;
    }

    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    let vacationPills = '';
    let totalVacation = 0;
    const pillBase = "w-full text-center py-2 rounded-full text-xs font-bold border shadow-sm cursor-default";

    Object.keys(state.scheduleData).forEach(name=>{
        const emp = state.scheduleData[name];
        const st = emp.schedule[state.currentDay-1] || 'F';
        
        // --- LOGICA DE LISTA VERTICAL ---
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
            totalVacation++; vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
        }
        else {
            o++; lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
        }
    });

    if(document.getElementById('kpiWorking')) {
        document.getElementById('kpiWorking').textContent=w; 
        document.getElementById('kpiOff').textContent=o;
        document.getElementById('kpiVacation').textContent=totalVacation; 
        document.getElementById('kpiOffShift').textContent=os;
        
        document.getElementById('listWorking').innerHTML = lists.w;
        document.getElementById('listOffShift').innerHTML = lists.os;
        document.getElementById('listOff').innerHTML = lists.o;
        document.getElementById('listVacation').innerHTML = vacationPills || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém.</span>';
    }
}

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    btn.innerHTML = 'Salvando...';
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });
        document.getElementById('saveStatus').textContent = "Sincronizado";
        document.getElementById('saveStatus').classList.remove('text-orange-400');
        btn.innerHTML = 'Salvar';
    } catch (e) { alert("Erro ao salvar"); }
}
