// admin-module.js
import { db, state, isWorkingTime, pad, daysOfWeek } from './config.js';
import { doc, setDoc, updateDoc, collection, query, where, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    const hint = document.getElementById('adminEditHint');
    
    if(toolbar) toolbar.classList.remove('hidden');
    if(hint) hint.classList.remove('hidden');
    document.body.style.paddingBottom = "120px";

    // GESTÃO DE ABAS DO ADMIN
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    
    // Esconde aba de Colaborador e mostra aba de Admin
    document.getElementById('tabRequests').classList.add('hidden'); 
    document.getElementById('tabAdminRequests').classList.remove('hidden');

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
    if(btnConfirmSave) btnConfirmSave.onclick = confirmSaveToCloud;
    if(btnCancelSave) btnCancelSave.onclick = closeSaveModal;

    populateEmployeeSelect();
    initAdminRequests(); 
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

// --- GESTÃO DE SOLICITAÇÕES (LÍDER) ---
function initAdminRequests() {
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // O Líder escuta todas as solicitações que estão no status 'pending_leader'
    const q = query(
        collection(db, "solicitacoes"), 
        where("monthId", "==", docId), 
        where("status", "==", "pending_leader")
    );

    onSnapshot(q, (snap) => {
        const container = document.getElementById('adminRequestsList');
        const badge = document.getElementById('adminRequestsBadge');
        
        if(!container) return;
        container.innerHTML = '';

        // Atualiza Badge
        if (badge) {
            if (!snap.empty) {
                badge.textContent = snap.size;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if(snap.empty) {
            container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-12 text-gray-500 opacity-50">
                <i class="fas fa-check-circle text-5xl mb-4"></i>
                <p class="text-sm font-bold uppercase tracking-widest">Nenhuma pendência</p>
            </div>`;
            return;
        }
        
        snap.forEach(docSnap => {
            const r = docSnap.data();
            const reqId = docSnap.id;
            
            // Texto descritivo
            let headerTitle = "";
            let description = "";
            
            if (r.type === 'troca_turno') {
                headerTitle = "Troca de Turno";
                description = `<strong class="text-white">${r.requester}</strong> deseja alterar seu turno.`;
            } else {
                headerTitle = "Troca de Dia/Folga";
                description = `<strong class="text-white">${r.requester}</strong> e <strong class="text-white">${r.target}</strong> aceitaram a troca.`;
            }

            // Renderiza o Card "Clean" para Admin
            container.innerHTML += `
            <div class="relative bg-[#1A1C2E] border border-white/5 rounded-xl shadow-xl overflow-hidden transition-all hover:border-amber-500/30 group">
                <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>

                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Pendente
                        </span>
                        <div class="bg-black/30 border border-white/10 px-3 py-1 rounded text-center">
                            <span class="text-[9px] font-bold text-gray-400 block uppercase">Dia</span>
                            <span class="text-lg font-bold text-white block leading-none">${r.dayIndex+1}</span>
                        </div>
                    </div>

                    <div class="mb-5">
                        <h3 class="text-white text-base font-bold mb-1">${headerTitle}</h3>
                        <p class="text-xs text-gray-400 leading-relaxed">${description}</p>
                    </div>

                    <div class="bg-black/20 border border-white/5 rounded-lg p-3 mb-6 relative">
                        <i class="fas fa-quote-left text-gray-700 absolute top-2 left-2 text-[10px]"></i>
                        <p class="text-xs text-gray-400 italic text-center px-2">"${r.reason}"</p>
                    </div>

                    <div class="flex gap-3">
                        <button onclick="window.handleAdminRequest('${reqId}', 'approve')" 
                            class="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-lg shadow-emerald-900/10 flex items-center justify-center gap-2">
                            <i class="fas fa-check"></i> APROVAR
                        </button>
                        <button onclick="window.handleAdminRequest('${reqId}', 'reject')" 
                            class="flex-1 py-2.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-900/10 font-bold text-xs transition-colors flex items-center justify-center gap-2">
                            <i class="fas fa-times"></i> RECUSAR
                        </button>
                    </div>
                </div>
            </div>`;
        });
    });
}

// Torna a função global para ser chamada pelo HTML
window.handleAdminRequest = async (reqId, action) => {
    // Aqui usamos o mesmo modal visual se você quiser, ou um confirm simples. 
    // Para consistência rápida, vou usar o confirm nativo no admin por enquanto, 
    // ou podemos implementar o openConfirmationModal também para admin se desejar.
    // Pelo pedido anterior, vamos manter simples/funcional aqui:
    
    const btnLabel = action === 'approve' ? 'Aprovar' : 'Recusar';
    if(!confirm(`Confirma ${btnLabel} esta solicitação?`)) return;

    try {
        const reqRef = doc(db, "solicitacoes", reqId);
        const reqSnap = await getDoc(reqRef);
        
        if (!reqSnap.exists()) { alert("Solicitação não encontrada."); return; }
        const r = reqSnap.data();

        if (action === 'reject') {
            await updateDoc(reqRef, { status: 'rejected' });
            alert("Solicitação recusada.");
            return;
        }

        // --- LÓGICA DE APROVAÇÃO (EXECUTAR A TROCA) ---
        if (action === 'approve') {
            const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
            const scaleRef = doc(db, "escalas", docId);
            const scaleSnap = await getDoc(scaleRef);
            
            let currentScheduleData = scaleSnap.exists() ? scaleSnap.data() : state.rawSchedule;
            
            // Garante estrutura Requester
            if(!currentScheduleData[r.requester]) currentScheduleData[r.requester] = {};
            if(!currentScheduleData[r.requester].calculatedSchedule) {
                currentScheduleData[r.requester].calculatedSchedule = state.scheduleData[r.requester]?.schedule || [];
            }

            const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
            while(currentScheduleData[r.requester].calculatedSchedule.length < totalDays) {
                currentScheduleData[r.requester].calculatedSchedule.push('F');
            }

            // Execução baseada no tipo
            if (r.type === 'troca_turno') {
                const currentSt = currentScheduleData[r.requester].calculatedSchedule[r.dayIndex];
                currentScheduleData[r.requester].calculatedSchedule[r.dayIndex] = (currentSt === 'T') ? 'F' : 'T';
            } else {
                // Garante estrutura Target
                if(!currentScheduleData[r.target]) currentScheduleData[r.target] = {};
                if(!currentScheduleData[r.target].calculatedSchedule) {
                     currentScheduleData[r.target].calculatedSchedule = state.scheduleData[r.target]?.schedule || [];
                }
                while(currentScheduleData[r.target].calculatedSchedule.length < totalDays) {
                    currentScheduleData[r.target].calculatedSchedule.push('F');
                }

                // SWAP
                const valA = currentScheduleData[r.requester].calculatedSchedule[r.dayIndex];
                const valB = currentScheduleData[r.target].calculatedSchedule[r.dayIndex];

                currentScheduleData[r.requester].calculatedSchedule[r.dayIndex] = valB;
                currentScheduleData[r.target].calculatedSchedule[r.dayIndex] = valA;
            }

            // Salva
            await setDoc(scaleRef, currentScheduleData, { merge: true });
            await updateDoc(reqRef, { status: 'approved' });

            // Atualiza estado local
            state.rawSchedule = currentScheduleData;
            const event = new Event('change');
            const el = document.getElementById('employeeSelect');
            if(el) el.dispatchEvent(event);
            if (state.currentDay === (r.dayIndex + 1)) renderDailyView();

            alert("Aprovado! A escala foi atualizada automaticamente.");
        }

    } catch (e) {
        console.error(e);
        alert("Erro crítico ao aprovar: " + e.message);
    }
};


// --- FUNÇÕES DO MODAL DE EDIÇÃO MANUAL ---
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

// --- FUNÇÕES DE SALVAMENTO ---
function openSaveModal() {
    document.getElementById('adminSaveModal').classList.remove('hidden');
}

function closeSaveModal() {
    document.getElementById('adminSaveModal').classList.add('hidden');
}

function openSuccessModal(msg) {
    const modal = document.getElementById('successModal');
    const msgEl = document.getElementById('successMessage');
    if(modal && msgEl) {
        msgEl.textContent = msg;
        modal.classList.remove('hidden');
    }
}

async function confirmSaveToCloud() {
    const btnConfirm = document.getElementById('btnSaveConfirm');
    const originalText = btnConfirm.innerHTML;
    btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btnConfirm.disabled = true;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });
        closeSaveModal();
        openSuccessModal(`Dados salvos com sucesso em ${docId}`);
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
        console.error("Erro ao salvar:", e);
        alert("Erro: " + e.message); 
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
                 os++;
                 lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            } else if(st === 'FE' || st === 'FÉRIAS') {
                v++;
                vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
            } else {
                o++;
                lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
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
