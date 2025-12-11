// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, updateDoc, doc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initCollabUI() {
    ['adminToolbar', 'adminEditHint', 'employeeSelectContainer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    // SEGURANÇA: Garante que o nome existe
    const userName = (state.profile && state.profile.name) ? state.profile.name : "Desconhecido";
    
    const welcome = document.getElementById('welcomeUser');
    if(welcome) {
        welcome.textContent = `Olá, ${userName}`;
        welcome.classList.remove('hidden');
    }

    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    if(userName !== "Desconhecido") {
        updatePersonalView(userName);
    }
    updateWeekendTable(null); 
    
    initRequestsTab(); 
    setupEventListeners();
}

function setupEventListeners() {
    const replaceBtn = (id, fn) => {
        const old = document.getElementById(id);
        if(old) {
            const clone = old.cloneNode(true);
            old.parentNode.replaceChild(clone, old);
            clone.onclick = fn;
        }
    };
    replaceBtn('btnNewRequestDynamic', openManualRequestModal);
    replaceBtn('btnSendRequest', sendRequest);

    const reqType = document.getElementById('reqType');
    if(reqType) {
        reqType.onchange = (e) => {
            const isShift = e.target.value === 'troca_turno';
            document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);
        };
    }
}

export function handleCollabCellClick(name, dayIndex) {
    if(state.isAdmin) return; 
    if(!state.profile || name !== state.profile.name) return; 
    openRequestModal(dayIndex);
}

// MODAIS
function openRequestModal(dayIndex) {
    const d = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, dayIndex + 1);
    document.getElementById('reqDateDisplay').textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    document.getElementById('reqDateDisplay').classList.remove('hidden');
    document.getElementById('reqDateManual').classList.add('hidden');
    document.getElementById('reqDateIndex').value = dayIndex;
    prepareModalCommon();
}

function openManualRequestModal() {
    document.getElementById('reqDateDisplay').classList.add('hidden');
    document.getElementById('reqDateManual').classList.remove('hidden');
    document.getElementById('reqDateIndex').value = ''; 
    prepareModalCommon();
}

function prepareModalCommon() {
    document.getElementById('reqEmployeeName').value = state.profile.name || '';
    const currentType = state.activeRequestType || 'troca_dia_trabalho';
    document.getElementById('reqType').value = currentType;
    
    const isShift = (currentType === 'troca_turno');
    document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);
    
    setupModalTargetSelect();
    document.getElementById('requestModal').classList.remove('hidden');
}

function setupModalTargetSelect() {
    const s = document.getElementById('reqTargetEmployee');
    s.innerHTML = '<option value="">Selecione o colega...</option>';
    if(state.scheduleData) {
        const myName = state.profile ? state.profile.name : '';
        Object.keys(state.scheduleData).sort().forEach(n => { 
            if(n !== myName) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                s.appendChild(opt);
            }
        });
    }
}

async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const type = document.getElementById('reqType').value;
        let idx = document.getElementById('reqDateIndex').value;
        let name = state.profile.name;

        if(!name) throw new Error("Erro: Perfil sem nome. Não é possível enviar.");

        if(!idx) {
            const manualDate = document.getElementById('reqDateManual').value;
            if(!manualDate) throw new Error("Selecione a data.");
            idx = parseInt(manualDate.split('-')[2]) - 1;
        } else {
            idx = parseInt(idx);
        }

        const reason = document.getElementById('reqReason').value;
        const targetInput = document.getElementById('reqTargetEmployee').value;
        const isShiftSwap = (type === 'troca_turno');

        if (!isShiftSwap && !targetInput) throw new Error("Selecione o colega.");
        if (!reason) throw new Error("Informe o motivo.");

        const initialStatus = isShiftSwap ? 'pending_leader' : 'pending_peer';
        const targetUser = isShiftSwap ? 'LÍDER' : targetInput;
        const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;

        await addDoc(collection(db, "solicitacoes"), {
            monthId: docId,
            requester: name,
            dayIndex: idx,
            type: type,
            target: targetUser,
            reason: reason,
            status: initialStatus,
            createdAt: serverTimestamp()
        });
        
        document.getElementById('requestModal').classList.add('hidden');
        alert("Solicitação enviada!");
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert(e.message); 
    } finally { 
        btn.innerHTML = 'Enviar'; btn.disabled = false; 
    }
}

// AÇÃO DE APROVAR/RECUSAR (Para Colega)
window.processCollabRequest = async (reqId, action) => {
    if(!confirm(`Deseja ${action === 'accept' ? 'ACEITAR' : 'RECUSAR'}?`)) return;
    try {
        const reqRef = doc(db, "solicitacoes", reqId);
        if (action === 'accept') {
            await updateDoc(reqRef, { status: 'pending_leader' });
            alert("Aceito! Enviado para o líder.");
        } else {
            await updateDoc(reqRef, { status: 'rejected' });
            alert("Recusado.");
        }
    } catch (e) { console.error(e); alert("Erro: " + e.message); }
};

// LISTAGEM (BLINDADA)
function initRequestsTab() {
    // Se o nome não existe ou é inválido, não faz a query para não travar
    if (!state.profile || !state.profile.name || state.profile.name === "Desconhecido") {
        console.warn("Aba solicitações desativada (Sem nome de perfil).");
        return;
    }

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // ENVIADAS
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        if(snap.empty) list.innerHTML = '<p class="text-gray-500 text-xs text-center">Nada enviado.</p>';

        snap.forEach(d => {
            const r = d.data();
            let stLabel = 'Pendente'; let stColor = 'text-gray-400';
            if(r.status === 'pending_peer') { stLabel = 'Aguardando Colega'; stColor = 'text-yellow-500'; }
            if(r.status === 'pending_leader') { stLabel = 'Aguardando Líder'; stColor = 'text-blue-400'; }
            if(r.status === 'approved') { stLabel = 'Aprovado'; stColor = 'text-green-400'; }
            if(r.status === 'rejected') { stLabel = 'Recusado'; stColor = 'text-red-400'; }

            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded border border-[#2E3250] flex justify-between items-center">
                <div><div class="text-xs font-bold text-sky-400">${r.type.toUpperCase()}</div><div class="text-xs text-gray-400">Para: ${r.target}</div></div>
                <span class="text-[9px] ${stColor} border border-gray-700 px-2 rounded uppercase">${stLabel}</span>
            </div>`;
        });
    });

    // RECEBIDAS
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';
        let count = 0;

        snap.forEach(d => {
            const r = d.data();
            if(r.status === 'pending_peer') {
                count++;
                list.innerHTML += `
                <div class="bg-[#0F1020] p-3 mb-2 rounded border border-yellow-500/30">
                    <div class="flex justify-between mb-2"><span class="text-yellow-500 font-bold text-xs">${r.requester}</span><span class="text-xs text-gray-400">Dia ${r.dayIndex+1}</span></div>
                    <div class="text-xs text-gray-400 italic mb-2">"${r.reason}"</div>
                    <div class="flex gap-2">
                        <button onclick="window.processCollabRequest('${d.id}','accept')" class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1 rounded text-xs">Aceitar</button>
                        <button onclick="window.processCollabRequest('${d.id}','reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1 rounded text-xs">Recusar</button>
                    </div>
                </div>`;
            }
        });
        if (count === 0) list.innerHTML = '<p class="text-gray-500 text-xs text-center">Nenhuma pendente.</p>';
    });
}
