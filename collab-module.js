// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

export function initCollabUI() {
    // Limpa UI Admin
    ['adminToolbar', 'adminEditHint', 'employeeSelectContainer'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    // Verifica Nome
    const userName = state.profile ? state.profile.name : null;
    const welcome = document.getElementById('welcomeUser');

    if (!userName) {
        if(welcome) welcome.textContent = "Erro: Perfil sem nome.";
        alert("Seu perfil não tem nome cadastrado. A central de trocas pode falhar.");
    } else {
        if(welcome) {
            welcome.textContent = `Olá, ${userName}`;
            welcome.classList.remove('hidden');
        }
    }

    // Configura Abas
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    if(userName) updatePersonalView(userName);
    updateWeekendTable(null); 
    
    initRequestsTab(); 
    setupEventListeners();
}

function setupEventListeners() {
    // Configura botões com replace para evitar duplicação de eventos
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

    // Listener do Select de Tipo (para mostrar/esconder o campo "Trocar com quem")
    const reqType = document.getElementById('reqType');
    if(reqType) {
        reqType.onchange = (e) => {
            toggleTargetSelect(e.target.value);
        };
    }
}

function toggleTargetSelect(type) {
    const targetContainer = document.getElementById('swapTargetContainer');
    // Se for Troca de Turno, esconde o alvo (vai pro líder). Se for Dia/Folga, mostra.
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
    // Data vinda do clique
    const d = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, dayIndex + 1);
    
    document.getElementById('reqDateDisplay').textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    document.getElementById('reqDateDisplay').classList.remove('hidden');
    document.getElementById('reqDateManual').classList.add('hidden');
    document.getElementById('reqDateIndex').value = dayIndex;
    
    prepareModalCommon();
}

function openManualRequestModal() {
    // Data manual
    document.getElementById('reqDateDisplay').classList.add('hidden');
    document.getElementById('reqDateManual').classList.remove('hidden');
    document.getElementById('reqDateIndex').value = ''; 
    
    prepareModalCommon();
}

function prepareModalCommon() {
    document.getElementById('reqEmployeeName').value = state.profile.name;
    
    // Define o tipo baseado na aba que o usuário clicou (state.activeRequestType)
    const currentType = state.activeRequestType || 'troca_dia_trabalho';
    document.getElementById('reqType').value = currentType;
    
    // Ajusta visibilidade do campo "Colega"
    toggleTargetSelect(currentType);
    
    setupModalTargetSelect();
    document.getElementById('requestModal').classList.remove('hidden');
}

function setupModalTargetSelect() {
    const s = document.getElementById('reqTargetEmployee');
    s.innerHTML = '<option value="">Selecione o colega...</option>';
    
    if(state.scheduleData) {
        const myName = state.profile.name;
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
        const reason = document.getElementById('reqReason').value;
        const target = document.getElementById('reqTargetEmployee').value;
        const name = state.profile.name;

        // Validação de Data
        if(!idx) {
            const manualDate = document.getElementById('reqDateManual').value;
            if(!manualDate) throw new Error("Selecione a data.");
            idx = parseInt(manualDate.split('-')[2]) - 1;
        } else {
            idx = parseInt(idx);
        }

        // Validação Específica por Tipo
        const isShiftSwap = (type === 'troca_turno');
        
        if (!isShiftSwap && !target) throw new Error("Selecione com quem deseja trocar.");
        if (!reason) throw new Error("Informe o motivo.");

        // Define status inicial
        // Troca de Turno -> Vai direto pro Líder
        // Troca de Dia/Folga -> Vai pro Colega aprovar primeiro
        const initialStatus = isShiftSwap ? 'pending_leader' : 'pending_peer';
        
        const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;

        await addDoc(collection(db, "solicitacoes"), {
            monthId: docId,
            requester: name,
            dayIndex: idx,
            type: type, // 'troca_dia_trabalho', 'troca_folga', 'troca_turno'
            target: isShiftSwap ? 'LÍDER' : target,
            reason: reason,
            status: initialStatus,
            createdAt: serverTimestamp()
        });
        
        document.getElementById('requestModal').classList.add('hidden');
        alert("Solicitação enviada!");
        
        // Limpa form
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar Solicitação'; btn.disabled = false; 
    }
}

// --- LISTAGEM ---
function initRequestsTab() {
    if (!state.profile || !state.profile.name) return;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 1. Minhas Solicitações (Enviadas)
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        
        if(snap.empty) list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma enviada.</p>';

        snap.forEach(d => {
            const r = d.data();
            const typeLabel = r.type.replace(/_/g, ' ').toUpperCase();
            
            // Cor do status
            let stColor = 'text-gray-400';
            let stLabel = r.status;
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

    // 2. Recebidas (Alguém quer trocar comigo)
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';

        let count = 0;
        snap.forEach(d => {
            const r = d.data();
            // Só mostra se eu preciso aprovar (pending_peer)
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
                        <button class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1.5 rounded text-xs font-bold hover:bg-green-600 hover:text-white">Aceitar</button>
                        <button class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white">Recusar</button>
                    </div>
                </div>`;
            }
        });
        
        if(count === 0) list.innerHTML = '<p class="text-center text-gray-500 text-xs py-2">Nenhuma solicitação pendente.</p>';
    });
}
