// collab-module.js
import { db, state, pad } from './config.js';
// Adicionei updateDoc para permitir a aprovação
import { addDoc, updateDoc, doc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

// --- INICIALIZAÇÃO ---
export function initCollabUI() {
    // Limpa elementos de Admin
    ['adminToolbar', 'adminEditHint', 'employeeSelectContainer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    // Verifica Perfil
    const userName = state.profile ? state.profile.name : null;
    const welcome = document.getElementById('welcomeUser');

    if (!userName) {
        if(welcome) welcome.innerHTML = `<span class="text-red-400">Erro: Perfil sem nome.</span>`;
    } else {
        if(welcome) {
            welcome.textContent = `Olá, ${userName}`;
            welcome.classList.remove('hidden');
        }
    }

    // Configura Visual
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    if(userName) updatePersonalView(userName);
    updateWeekendTable(null); 
    
    // Inicia ouvintes
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
            toggleTargetSelect(e.target.value);
        };
    }
}

function toggleTargetSelect(type) {
    const targetContainer = document.getElementById('swapTargetContainer');
    // Troca de Turno não precisa de colega específico (vai pro líder)
    const isShiftSwap = (type === 'troca_turno');
    
    if (isShiftSwap) {
        targetContainer.classList.add('hidden');
    } else {
        targetContainer.classList.remove('hidden');
    }
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
    document.getElementById('reqEmployeeName').value = state.profile.name;
    
    // Pega o tipo da aba ativa (ex: 'troca_turno')
    const currentType = state.activeRequestType || 'troca_dia_trabalho';
    document.getElementById('reqType').value = currentType;
    
    toggleTargetSelect(currentType);
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

// --- ENVIAR SOLICITAÇÃO ---
async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const type = document.getElementById('reqType').value;
        let idx = document.getElementById('reqDateIndex').value;
        let name = state.profile.name; // Garante que usa o nome do perfil logado

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

        if (!isShiftSwap && !targetInput) throw new Error("Selecione com quem deseja trocar.");
        if (!reason) throw new Error("Informe o motivo.");

        // LÓGICA DE FLUXO:
        // Turno -> Vai pro Líder
        // Dia/Folga -> Vai pro Colega
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
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar'; btn.disabled = false; 
    }
}

// --- PROCESSAR SOLICITAÇÃO (ACEITAR/RECUSAR) ---
// Essa função é chamada pelos botões HTML gerados dinamicamente
window.processCollabRequest = async (reqId, action) => {
    if(!confirm(`Deseja ${action === 'accept' ? 'ACEITAR' : 'RECUSAR'} esta troca?`)) return;

    try {
        const reqRef = doc(db, "solicitacoes", reqId);
        
        if (action === 'accept') {
            // Se o colega aceita, vai para o Líder aprovar final
            await updateDoc(reqRef, { status: 'pending_leader' });
            alert("Você aceitou! Agora a solicitação foi enviada para aprovação do líder.");
        } else {
            // Se recusa, morre aqui
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
    if (!state.profile || !state.profile.name) return;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 1. Minhas Solicitações (Enviadas)
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        
        if (snap.empty) list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma enviada.</p>';

        snap.forEach(d => {
            const r = d.data();
            const typeLabel = r.type.replace(/_/g, ' ').toUpperCase();
            
            let stLabel = 'Pendente';
            let stColor = 'text-gray-400';
            
            if(r.status === 'pending_peer') { stLabel = 'Aguardando Colega'; stColor = 'text-yellow-500'; }
            if(r.status === 'pending_leader') { stLabel = 'Aguardando Líder'; stColor = 'text-blue-400'; }
            if(r.status === 'approved') { stLabel = 'Aprovado'; stColor = 'text-green-400'; }
            if(r.status === 'rejected') { stLabel = 'Recusado'; stColor = 'text-red-400'; }

            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250] flex justify-between items-center">
                <div>
                    <div class="text-[10px] text-sky-400 font-bold mb-1">${typeLabel} • Dia ${r.dayIndex+1}</div>
                    <div class="text-xs text-gray-300">Para: <span class="text-white font-bold">${r.target}</span></div>
                    <div class="text-[10px] text-gray-500 italic">"${r.reason}"</div>
                </div>
                <span class="text-[9px] font-bold uppercase border border-gray-700 px-2 py-1 rounded ${stColor}">${stLabel}</span>
            </div>`;
        });
    });

    // 2. Recebidas (Para eu aprovar)
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';

        let count = 0;
        snap.forEach(d => {
            const r = d.data();
            // Só mostro botão de ação se estiver esperando MINHA aprovação (pending_peer)
            if(r.status === 'pending_peer') {
                count++;
                list.innerHTML += `
                <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-yellow-500/30">
                    <div class="flex justify-between mb-2">
                        <span class="text-yellow-500 font-bold text-xs uppercase">Solicitação de ${r.requester}</span>
                        <span class="text-xs text-gray-400">Dia ${r.dayIndex+1}</span>
                    </div>
                    <div class="text-xs text-white mb-1">Tipo: ${r.type.replace(/_/g, ' ')}</div>
                    <div class="text-xs text-gray-400 italic mb-3">"${r.reason}"</div>
                    <div class="flex gap-2">
                        <button onclick="window.processCollabRequest('${d.id}','accept')" class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1.5 rounded text-xs font-bold hover:bg-green-600 hover:text-white transition">Aceitar</button>
                        <button onclick="window.processCollabRequest('${d.id}','reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Recusar</button>
                    </div>
                </div>`;
            }
        });

        if (count === 0) list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma pendente.</p>';
    });
}
