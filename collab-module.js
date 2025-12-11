// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, updateDoc, doc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initCollabUI() {
    // 1. Limpa UI de Admin e ajusta visualização
    ['adminToolbar', 'adminEditHint', 'employeeSelectContainer', 'adminRequestsPanel'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    const userName = (state.profile && state.profile.name) ? state.profile.name : null;
    const welcome = document.getElementById('welcomeUser');

    if (!userName) {
        if(welcome) welcome.innerHTML = `<span class="text-red-400">Erro: Perfil sem nome. Avise o Admin.</span>`;
    } else {
        if(welcome) {
            welcome.textContent = `Olá, ${userName}`;
            welcome.classList.remove('hidden');
        }
    }

    // Mostra as abas corretas
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    if(userName) updatePersonalView(userName);
    updateWeekendTable(null); 
    
    if (userName) {
        initRequestsTab(); 
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
    // Monitora a mudança na sub-aba (controlada pelo ui.js via state.activeRequestType)
    // Vamos adicionar um observer ou apenas garantir que ao abrir o modal leia o estado
}

export function handleCollabCellClick(name, dayIndex) {
    if(state.isAdmin) return; 
    if(!state.profile || name !== state.profile.name) return; 
    openRequestModal(dayIndex);
}

// --- MODAIS ---
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
    document.getElementById('reqEmployeeName').value = state.profile ? state.profile.name : '';
    
    const currentType = state.activeRequestType || 'troca_dia_trabalho';
    document.getElementById('reqType').value = currentType;
    
    // Configura visibilidade do campo "Colega"
    const targetContainer = document.getElementById('swapTargetContainer');
    const isShiftSwap = (currentType === 'troca_turno');
    
    if (targetContainer) {
        if (isShiftSwap) {
            targetContainer.classList.add('hidden');
        } else {
            targetContainer.classList.remove('hidden');
            setupModalTargetSelect();
        }
    }
    
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

// --- ENVIO DA SOLICITAÇÃO ---
async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const type = state.activeRequestType || 'troca_dia_trabalho'; // Pega do estado global
        let idx = document.getElementById('reqDateIndex').value;
        const name = state.profile.name;

        if(!name) throw new Error("Erro: Perfil sem nome.");

        if(!idx) {
            const manualDate = document.getElementById('reqDateManual').value;
            if(!manualDate) throw new Error("Selecione a data.");
            idx = parseInt(manualDate.split('-')[2]) - 1;
        } else {
            idx = parseInt(idx);
        }

        const reason = document.getElementById('reqReason').value;
        const targetInput = document.getElementById('reqTargetEmployee').value;
        
        // REGRA DE NEGÓCIO:
        const isShiftSwap = (type === 'troca_turno');

        if (!isShiftSwap && !targetInput) throw new Error("Selecione com quem deseja trocar.");
        if (!reason) throw new Error("Informe o motivo.");

        // LÓGICA DE DESTINO
        // Troca de Turno -> Vai direto para o Líder (pending_leader)
        // Troca de Dia/Folga -> Vai para o Colega (pending_peer)
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
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar Solicitação'; btn.disabled = false; 
    }
}

// --- APROVAÇÃO (COLEGA) ---
window.processCollabRequest = async (reqId, action) => {
    if(!confirm(`Deseja ${action === 'accept' ? 'ACEITAR' : 'RECUSAR'} esta solicitação?`)) return;

    try {
        const reqRef = doc(db, "solicitacoes", reqId);
        
        if (action === 'accept') {
            // Colega aceitou -> O status muda para 'pending_leader' para o admin ver
            await updateDoc(reqRef, { status: 'pending_leader' });
            alert("Você aceitou a troca! Agora a solicitação foi enviada para aprovação do LÍDER.");
        } else {
            // Colega recusou -> Status 'rejected' e fim de papo
            await updateDoc(reqRef, { status: 'rejected' });
            alert("Solicitação recusada e encerrada.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao processar: " + e.message);
    }
};

// --- LISTAGEM DE SOLICITAÇÕES ---
function initRequestsTab() {
    if (!state.profile || !state.profile.name) return;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 1. LISTA DE ENVIADAS (Pelo usuário logado)
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        if(snap.empty) list.innerHTML = '<p class="text-gray-500 text-xs text-center py-2">Nenhuma solicitação enviada.</p>';

        snap.forEach(d => {
            const r = d.data();
            const typeDisplay = r.type.replace(/_/g, ' ').toUpperCase();
            
            let stLabel = r.status;
            let stColor = 'text-gray-400';
            
            if(r.status === 'pending_peer') { stLabel = 'Aguardando Colega'; stColor = 'text-yellow-500'; }
            if(r.status === 'pending_leader') { stLabel = 'Aguardando Líder'; stColor = 'text-blue-400'; }
            if(r.status === 'approved') { stLabel = 'Aprovado'; stColor = 'text-green-400'; }
            if(r.status === 'rejected') { stLabel = 'Recusado'; stColor = 'text-red-400'; }

            const targetDisplay = r.target === 'LÍDER' ? 'Admin/Líder' : r.target;

            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250] flex justify-between items-center">
                <div>
                    <div class="text-[10px] text-sky-400 font-bold mb-1">${typeDisplay} • Dia ${r.dayIndex+1}</div>
                    <div class="text-xs text-gray-300">Para: <span class="text-white font-bold">${targetDisplay}</span></div>
                    <div class="text-[10px] text-gray-500 italic mt-1">"${r.reason}"</div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="text-[9px] font-bold uppercase border border-gray-700 px-2 py-1 rounded ${stColor}">${stLabel}</span>
                </div>
            </div>`;
        });
    });

    // 2. LISTA DE RECEBIDAS (Onde o usuário é o TARGET e precisa aprovar)
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';
        let count = 0;

        snap.forEach(d => {
            const r = d.data();
            // Só mostra se estiver esperando APROVAÇÃO DO COLEGA (pending_peer)
            if(r.status === 'pending_peer') {
                count++;
                list.innerHTML += `
                <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-yellow-500/30 shadow-lg shadow-yellow-900/10">
                    <div class="flex justify-between mb-2">
                        <span class="text-yellow-400 font-bold text-xs uppercase flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i> Requer sua atenção</span>
                        <span class="text-xs text-white font-mono bg-gray-800 px-2 rounded">Dia ${r.dayIndex+1}</span>
                    </div>
                    <div class="text-sm text-white mb-1 font-bold">${r.requester} quer trocar com você.</div>
                    <div class="text-xs text-gray-400 mb-1">Tipo: ${r.type.replace(/_/g, ' ').toUpperCase()}</div>
                    <div class="text-xs text-gray-500 italic mb-3 bg-[#161828] p-2 rounded">"${r.reason}"</div>
                    <div class="flex gap-2">
                        <button onclick="window.processCollabRequest('${d.id}','accept')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold transition shadow-lg shadow-green-900/20">ACEITAR</button>
                        <button onclick="window.processCollabRequest('${d.id}','reject')" class="flex-1 bg-[#1A1C2E] border border-red-500/50 text-red-400 hover:bg-red-900/20 py-2 rounded-lg text-xs font-bold transition">RECUSAR</button>
                    </div>
                </div>`;
            }
        });

        if (count === 0) list.innerHTML = '<p class="text-center text-gray-500 text-xs py-4">Nenhuma solicitação pendente para você.</p>';
    });
}
