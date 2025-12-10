// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    const hint = document.getElementById('adminEditHint');
    
    // Garante que a interface apareça
    if(toolbar) toolbar.classList.remove('hidden');
    if(hint) hint.classList.remove('hidden');
    
    document.body.style.paddingBottom = "120px";

    // Mostra as abas corretas para Admin
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    
    // Mostra o seletor de funcionário
    document.getElementById('employeeSelectContainer').classList.remove('hidden');

    // Ativa o botão Salvar
    const btnSave = document.getElementById('btnSaveCloud');
    if(btnSave) btnSave.onclick = saveToCloud;

    // Carrega a lista de funcionários
    populateEmployeeSelect();
}

export function populateEmployeeSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    s.innerHTML = '<option value="">Selecione um colaborador...</option>';
    
    // Proteção: Só tenta listar se houver dados carregados
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

// --- EDIÇÃO POR CLIQUE (Conforme solicitado) ---
export function handleAdminCellClick(name, dayIndex) {
    // 1. Cria a estrutura na memória se não existir
    if (!state.rawSchedule[name]) state.rawSchedule[name] = {};
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    
    // Se não tiver um array de escala salvo, cria um novo
    if (!state.rawSchedule[name].calculatedSchedule) {
        state.rawSchedule[name].calculatedSchedule = state.scheduleData[name]?.schedule || new Array(totalDays).fill('F');
    }

    // 2. Pega o status atual do dia clicado
    const currentStatus = state.rawSchedule[name].calculatedSchedule[dayIndex] || 'F';

    // 3. Pergunta o novo status
    const newStatus = prompt(
        `EDITAR DIA ${dayIndex + 1} (${name})\n\nStatus Atual: ${currentStatus}\nDigite o novo código (T, F, FE, A):`, 
        currentStatus
    );

    // Se cancelar ou deixar igual, não faz nada
    if (newStatus === null || newStatus.toUpperCase() === currentStatus) return;

    const formatted = newStatus.toUpperCase();
    
    // 4. Atualiza Memória Bruta (Para salvar no banco)
    state.rawSchedule[name].calculatedSchedule[dayIndex] = formatted;
    
    // 5. Atualiza Memória Visual (Para ver a cor mudar na hora)
    if(state.scheduleData[name] && state.scheduleData[name].schedule) {
        state.scheduleData[name].schedule[dayIndex] = formatted;
    }

    // 6. Atualiza Telas
    updatePersonalView(name);     
    updateWeekendTable(null);     
    
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

// --- VISÃO DIÁRIA (CORRIGIDA E BLINDADA) ---
export function renderDailyView() {
    // 1. Atualiza Data no Topo
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

    // 2. Loop Seguro pelos Colaboradores
    if (state.scheduleData) {
        Object.keys(state.scheduleData).forEach(name => {
            const emp = state.scheduleData[name];
            
            // SEGURANÇA: Se o funcionário não tiver escala gerada, pula para evitar erro
            if (!emp || !emp.schedule) return;

            const st = emp.schedule[state.currentDay-1] || 'F';
            
            // Lógica de Contagem
            if(st === 'T') {
                // Tenta pegar horário. Se não existir, assume vazio.
                // IMPORTANTE: Se não tiver horário no banco, considera que está trabalhando (T).
                const hours = (emp.info && (emp.info.Horário || emp.info.Horario)) || '';
                
                if (isWorkingTime(hours)) {
                    w++; 
                    lists.w += `<div class="${pillBase} bg-green-900/30 text-green-400 border-green-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">T</span></div>`;
                } else {
                    os++; 
                    lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
                }
            }
            else if(st.includes('OFF')) {
                 os++; 
                 lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            }
            else if(st === 'FE' || st === 'FÉRIAS') {
                v++;
                vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
            }
            else {
                o++;
                lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
            }
        });
    }

    // 3. Atualiza os contadores na tela (se existirem)
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

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    const statusLabel = document.getElementById('saveStatus');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Salvando...';
    btn.disabled = true;

    // Garante que salve no mês correto
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
        
        alert("Escala salva com sucesso!");

    } catch (e) { 
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar: " + e.message);
        btn.innerHTML = 'Tentar Novamente';
    } finally {
        btn.disabled = false;
    }
}
