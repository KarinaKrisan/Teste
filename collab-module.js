// collab-module.js - Versão Estável
import { db, state, pad } from './config.js';
import { addDoc, updateDoc, doc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initCollabUI() {
    // 1. Esconde elementos exclusivos de Admin
    ['adminToolbar', 'adminEditHint', 'employeeSelectContainer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    // 2. Validação de Perfil e Nome
    // Garante que userName nunca seja undefined
    const userName = (state.profile && state.profile.name) ? state.profile.name : null;
    
    const welcome = document.getElementById('welcomeUser');
    if(welcome) {
        if (userName) {
            welcome.textContent = `Olá, ${userName}`;
            welcome.classList.remove('hidden');
        } else {
            // Fallback visual se não tiver nome
            welcome.innerHTML = `<span class="text-red-400 text-xs">Perfil incompleto (sem nome)</span>`;
            welcome.classList.remove('hidden');
        }
    }

    // 3. Configuração de Abas
    const tabDaily = document.getElementById('tabDaily');
    const tabPersonal = document.getElementById('tabPersonal');
    const tabRequests = document.getElementById('tabRequests');

    if(tabDaily) tabDaily.classList.add('hidden');
    if(tabPersonal) tabPersonal.classList.remove('hidden');
    if(tabRequests) tabRequests.classList.remove('hidden');

    // 4. Renderização de Dados
    if(userName) {
        updatePersonalView(userName);
    }
    updateWeekendTable(null); 
    
    // 5. Inicialização de Listeners e Consultas
    // Só inicia as consultas se tiver um nome válido para evitar o erro "Unsupported field value: undefined"
    if (userName) {
        initRequestsTab(); 
    } else {
        console.warn("initRequestsTab ignorado: Usuário sem nome definido.");
    }
    
    setupEventListeners();
}

function setupEventListeners() {
    // Helper para substituir botões e limpar eventos antigos
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
            const targetContainer = document.getElementById('swapTargetContainer');
            if(targetContainer) {
                targetContainer.classList.toggle('hidden', isShift);
            }
        };
    }
}

export function handleCollabCellClick(name, dayIndex) {
    if(state.isAdmin) return; 
    // Só permite clique se for o próprio usuário
    if(!state.profile || !state.profile.name || name !== state.profile.name) return; 
    openRequestModal(dayIndex);
}

// --- MODAIS ---
function openRequestModal(dayIndex) {
    const d = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, dayIndex + 1);
    
    const disp = document.getElementById('reqDateDisplay');
    const manual = document.getElementById('reqDateManual');
    const idx = document.getElementById('reqDateIndex');

    if(disp) {
        disp.textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
        disp.classList.remove('hidden');
    }
    if(manual) manual.classList.add('hidden');
    if(idx) idx.value = dayIndex;
    
    prepareModalCommon();
}

function openManualRequestModal() {
    const disp = document.getElementById('reqDateDisplay');
    const manual = document.getElementById('reqDateManual');
    const idx = document.getElementById('reqDateIndex');

    if(disp) disp.classList.add('hidden');
    if(manual) manual.classList.remove('hidden');
    if(idx) idx.value = ''; 
    
    prepareModalCommon();
}

function prepareModalCommon() {
    const empName = document.getElementById('reqEmployeeName');
    if(empName) empName.value = state.profile.name || '';
    
    const currentType = state.activeRequestType || 'troca_dia_trabalho';
    const typeSelect = document.getElementById('reqType');
    if(typeSelect) typeSelect.value = currentType;
    
    const isShift = (currentType === 'troca_turno');
    const targetContainer = document.getElementById('swapTargetContainer');
    if(targetContainer) targetContainer.classList.toggle('hidden', isShift);
    
    setupModalTargetSelect();
    document.getElementById('requestModal').classList.remove('hidden');
}

function setupModalTargetSelect() {
    const s = document.getElementById('reqTargetEmployee');
    if(!s) return;
    
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

// --- ENVIO ---
async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const type = document.getElementById('reqType').value;
        let idx = document.getElementById('reqDateIndex').value;
        let name = state.profile.name;

        if(!name) throw new Error("Erro de perfil: Nome não identificado.");

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

        if (!isShiftSwap && !targetInput) throw new Error("Selecione o colega com quem deseja trocar.");
        if (!reason) throw new Error("Informe o motivo da solicitação.");

        // Define status e alvo baseado no tipo
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
        alert("Solicitação enviada com sucesso!");
        
        // Limpa campos
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar'; btn.disabled = false; 
    }
}

// --- AÇÃO DO COLEGA (ACEITAR/RECUSAR) ---
window.processCollabRequest = async (reqId, action) => {
    if(!confirm(`Deseja ${action === 'accept' ? 'ACEITAR' : 'RECUSAR'} esta troca?`)) return;

    try {
        const reqRef = doc(db, "solicitacoes", reqId);
        
        if (action === 'accept') {
            await updateDoc(reqRef, { status: 'pending_leader' });
            alert("Você aceitou! A solicitação foi encaminhada para aprovação final do líder.");
        } else {
            await updateDoc(reqRef, { status: 'rejected' });
            alert("Solicitação recusada.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao processar: " + e.message);
    }
};

// --- LISTAGEM DE SOLICITAÇÕES ---
function initRequestsTab() {
    // Dupla checagem de segurança
    if (!state.profile || !state.profile.name) return;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 1. Minhas Solicitações (Enviadas)
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        
        if(snap.empty) {
            list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma solicitação enviada.</p>';
        }

        snap.forEach(d => {
            const r = d.data();
            let stLabel = 'Pendente'; let stColor = 'text-gray-400';
            
            if(r.status === 'pending_peer') { stLabel = 'Aguardando Colega'; stColor = 'text-yellow-500'; }
            if(r.status === 'pending_leader') { stLabel = 'Aguardando Líder'; stColor = 'text-blue-400'; }
            if(r.status === 'approved') { stLabel = 'Aprovado'; stColor = 'text-green-400'; }
            if(r.status === 'rejected') { stLabel = 'Recusado'; stColor = 'text-red-400'; }

            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250] flex justify-between items-center">
                <div>
                    <div class="text-[10px] text-sky-400 font-bold mb-1">${r.type.toUpperCase()} • Dia ${r.dayIndex+1}</div>
                    <div class="text-xs text-gray-300">Para: <span class="text-white font-bold">${r.target}</span></div>
                    <div class="text-[10px] text-gray-500 italic">"${r.reason}"</div>
                </div>
                <span class="text-[9px] font-bold uppercase border border-gray-700 px-2 py-1 rounded ${stColor}">${stLabel}</span>
            </div>`;
        });
    });

    // 2. Solicitações Recebidas (Para eu aprovar)
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';

        let count = 0;
        snap.forEach(d => {
            const r = d.data();
            // Mostra apenas se estiver esperando ação do colega (eu)
            if(r.status === 'pending_peer') {
                count++;
                list.innerHTML += `
                <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-yellow-500/30">
                    <div class="flex justify-between mb-2">
                        <span class="text-yellow-500 font-bold text-xs uppercase">De: ${r.requester}</span>
                        <span class="text-xs text-gray-400">Dia ${r.dayIndex+1}</span>
                    </div>
                    <div class="text-xs text-white mb-1">Tipo: ${r.type.toUpperCase()}</div>
                    <div class="text-xs text-gray-400 italic mb-3">"${r.reason}"</div>
                    <div class="flex gap-2">
                        <button onclick="window.processCollabRequest('${d.id}','accept')" class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1.5 rounded text-xs font-bold hover:bg-green-600 hover:text-white transition">Aceitar</button>
                        <button onclick="window.processCollabRequest('${d.id}','reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Recusar</button>
                    </div>
                </div>`;
            }
        });

        if (count === 0) {
            list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma solicitação pendente.</p>';
        }
    });
}
