// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

let dailyChartInstance = null; // Variável para controlar o gráfico

export function initAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    const hint = document.getElementById('adminEditHint');
    
    if(toolbar) toolbar.classList.remove('hidden');
    if(hint) hint.classList.remove('hidden');
    document.body.style.paddingBottom = "100px";

    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    
    document.getElementById('employeeSelectContainer').classList.remove('hidden');

    const btnSave = document.getElementById('btnSaveCloud');
    if(btnSave) btnSave.onclick = saveToCloud;

    populateEmployeeSelect();
}

export function populateEmployeeSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    const currentVal = s.value; // Mantém seleção se existir
    s.innerHTML = '<option value="">Selecione um colaborador...</option>';
    
    const names = Object.keys(state.scheduleData).sort();
    names.forEach(n => {
        const opt = document.createElement('option');
        opt.value = n;
        opt.textContent = n;
        s.appendChild(opt);
    });
    if(currentVal && names.includes(currentVal)) s.value = currentVal;

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
    console.log("Admin clicou:", name, dayIndex);
    // Futuro: Abrir modal de edição rápida
}

export function renderDailyView() {
    // 1. Atualiza Label da Data
    const dateLabel = document.getElementById('currentDateLabel');
    if(dateLabel) {
        // Garante que state.currentDay seja válido
        if(!state.currentDay) state.currentDay = 1;
        const d = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, state.currentDay);
        const dow = d.getDay();
        dateLabel.textContent = `${daysOfWeek[dow]}, ${pad(state.currentDay)}/${pad(state.selectedMonthObj.month+1)}`;
    }

    // 2. Contadores
    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    let vacationPills = '';
    let totalVacation = 0;
    const pillBase = "w-full text-center py-2 rounded-full text-xs font-bold border shadow-sm cursor-default animate-fade-in";

    if(state.scheduleData) {
        Object.keys(state.scheduleData).forEach(name=>{
            const emp = state.scheduleData[name];
            // Proteção contra array undefined
            if(!emp.schedule) return;
            
            const st = emp.schedule[state.currentDay-1] || 'F';
            
            if(st === 'T') {
                const hours = emp.info.Horário || emp.info.Horario || '';
                if (isWorkingTime(hours)) {
                    w++; lists.w += `<div class="${pillBase} bg-green-900/30 text-green-400 border-green-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">T</span></div>`;
                } else {
                    os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
                }
            }
            else if(typeof st === 'string' && st.includes('OFF')) {
                 os++; lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            }
            else if(st === 'FE') {
                totalVacation++;
                vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
            }
            else {
                o++;
                lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
            }
        });
    }

    // 3. Atualiza DOM
    if(document.getElementById('kpiWorking')) {
        document.getElementById('kpiWorking').textContent = w; 
        document.getElementById('kpiOff').textContent = o;
        document.getElementById('kpiVacation').textContent = totalVacation; 
        document.getElementById('kpiOffShift').textContent = os;
        
        document.getElementById('listWorking').innerHTML = lists.w;
        document.getElementById('listOffShift').innerHTML = lists.os;
        document.getElementById('listOff').innerHTML = lists.o;
        document.getElementById('listVacation').innerHTML = vacationPills || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém.</span>';
    
        // 4. Renderiza Gráfico
        renderChart(w, os, o, totalVacation);
    }
}

function renderChart(w, os, o, v) {
    const ctx = document.getElementById('dailyChart');
    if(!ctx) return;

    if (dailyChartInstance) {
        dailyChartInstance.destroy();
    }

    // Configuração do Gráfico (Doughnut)
    dailyChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Operação', 'Encerrado', 'Folga', 'Férias'],
            datasets: [{
                data: [w, os, o, v],
                backgroundColor: [
                    'rgba(74, 222, 128, 0.6)', // Verde
                    'rgba(217, 70, 239, 0.6)', // Fuchsia
                    'rgba(250, 204, 21, 0.6)', // Amarelo
                    'rgba(248, 113, 113, 0.6)'  // Vermelho
                ],
                borderColor: [
                    'rgba(74, 222, 128, 1)',
                    'rgba(217, 70, 239, 1)',
                    'rgba(250, 204, 21, 1)',
                    'rgba(248, 113, 113, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 10 } } }
            },
            cutout: '70%'
        }
    });
}

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    btn.innerHTML = '<i class="fas fa-sync fa-spin mr-2"></i> Salvando...';
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });
        document.getElementById('saveStatus').textContent = "Salvo: " + new Date().toLocaleTimeString();
        document.getElementById('saveStatus').classList.remove('text-orange-400');
        document.getElementById('saveStatus').classList.add('text-green-400');
        setTimeout(() => document.getElementById('saveStatus').classList.remove('text-green-400'), 3000);
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
    } catch (e) { 
        alert("Erro ao salvar: " + e.message); 
        btn.innerHTML = 'Erro ao Salvar';
    }
}
