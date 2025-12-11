// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

// --- INICIALIZAÇÃO DA UI ---
export function initCollabUI() {
    // 1. Limpa UI de Admin
    const elementsToHide = ['adminToolbar', 'adminEditHint', 'employeeSelectContainer'];
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });
    
    // 2. Verifica se o perfil tem nome
    const userName = state.profile ? state.profile.name : null;
    const welcome = document.getElementById('welcomeUser');

    if (!userName) {
        console.error("ERRO CRÍTICO: Perfil carregado sem campo 'name'.", state.profile);
        if(welcome) {
            welcome.innerHTML = `<span class="text-red-400"><i class="fas fa-exclamation-triangle"></i> Perfil sem nome! Verifique o banco.</span>`;
            welcome.classList.remove('hidden');
        }
        alert("Atenção: Seu cadastro no banco 'colaboradores' não tem o campo 'name'. A escala não pode ser carregada.");
    } else {
        if(welcome) {
            welcome.textContent = `Olá, ${userName}`;
            welcome.classList.remove('hidden');
        }
    }

    // 3. Configura Abas
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    // 4. Carrega dados visuais (Só se tiver nome)
    if(userName) {
        updatePersonalView(userName);
    }
    
    updateWeekendTable(null); 
    
    // 5. Inicia Listeners
    initRequestsTab(); 
    setupEventListeners();
}

function setupEventListeners() {
    // Clona e substitui para limpar listeners antigos
    const replaceListener = (id, handler) => {
        const el = document.getElementById(id);
        if(el) {
            const newEl = el.cloneNode(true);
            el.parentNode.replaceChild(newEl, el);
            newEl.onclick = handler;
        }
    };

    replaceListener('btnNewRequestDynamic', openManualRequestModal);
    replaceListener('btnSendRequest', sendRequest);

    const reqType = document.getElementById('reqType');
    if(reqType) {
        reqType.onchange = (e) => {
            const isShift = e.target.value === 'troca_turno';
            document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);
        };
    }
}

// --- INTERAÇÃO COM O CALENDÁRIO ---
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
    document.getElementById('reqEmployeeName').value = state.profile.name;
    
    setupModalTargetSelect();
    
    document.getElementById('reqType').value = state.activeRequestType || 'troca_dia_trabalho';
    const isShift = (document.getElementById('reqType').value === 'troca_turno');
    document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);

    document.getElementById('requestModal').classList.remove('hidden');
}

function openManualRequestModal() {
    document.getElementById('reqDateDisplay').classList.add('hidden');
    document.getElementById('reqDateManual').classList.remove('hidden');
    document.getElementById('reqDateIndex').value = ''; 
    document.getElementById('reqEmployeeName').value = state.profile ? state.profile.name : '';
    
    setupModalTargetSelect();
    
    document.getElementById('reqType').value = state.activeRequestType || 'troca_dia_trabalho';
    const isShift = (state.activeRequestType === 'troca_turno');
    document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);

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
    btn.innerHTML = 'Enviando...'; 
    btn.disabled = true;

    try {
        const type = document.getElementById('reqType').value;
        let idx = document.getElementById('reqDateIndex').value;
        let name = document.getElementById('reqEmployeeName').value;
        
        if(!name) throw new Error("Erro de perfil: Nome não identificado.");

        if(!idx) {
            const manualDate = document.getElementById('reqDateManual').value;
            if(!manualDate) throw new Error("Selecione uma data.");
            idx = parseInt(manualDate.split('-')[2]) - 1;
        } else {
            idx = parseInt(idx);
        }

        const target = document.getElementById('reqTargetEmployee').value;
        const reason = document.getElementById('reqReason').value;
        const needsPeer = (type !== 'troca_turno'); 

        if(needsPeer && !target) throw new Error("Selecione com quem trocar.");
        if(!reason) throw new Error("Informe o motivo.");

        const initialStatus = needsPeer ? 'pending_peer' : 'pending_leader';
        const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;

        await addDoc(collection(db, "solicitacoes"), {
            monthId: docId,
            requester: name,
            dayIndex: idx,
            type: type,
            target: target || null,
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
        btn.innerHTML = 'Enviar Solicitação'; 
        btn.disabled = false; 
    }
}

// --- LISTAGEM DE SOLICITAÇÕES (BLINDADA) ---
function initRequestsTab() {
    // BLINDAGEM: Se não tiver nome, para tudo antes de dar erro no Firebase
    if (!state.profile || !state.profile.name) {
        const listRec = document.getElementById('receivedRequestsList');
        const listSent = document.getElementById('sentRequestsList');
        if(listRec) listRec.innerHTML = '<p class="text-red-500 text-xs text-center py-4">Erro: Perfil sem nome.</p>';
        if(listSent) listSent.innerHTML = '<p class="text-red-500 text-xs text-center py-4">Erro: Perfil sem nome.</p>';
        return;
    }

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 1. Enviadas
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        
        if (snap.empty) list.innerHTML = '<p class="text-center text-gray-600 text-sm py-4 italic">Nenhuma solicitação enviada.</p>';

        snap.forEach(d => {
            const r = d.data();
            const colors = { 'pending_peer': 'text-yellow-500', 'pending_leader': 'text-blue-400', 'approved': 'text-green-400', 'rejected': 'text-red-400' };
            const statusMap = { 'pending_peer': 'Aguardando Colega', 'pending_leader': 'Aguardando Líder', 'approved': 'Aprovado', 'rejected': 'Recusado' };
            
            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250] flex justify-between items-center">
                <div>
                    <div class="text-xs text-gray-400">Dia ${r.dayIndex+1} • ${r.type}</div>
                    <div class="text-xs text-gray-500 italic">"${r.reason}"</div>
                </div>
                <span class="text-[10px] font-bold uppercase ${colors[r.status] || 'text-white'}">${statusMap[r.status] || r.status}</span>
            </div>`;
        });
    });

    // 2. Recebidas
    const qReceived = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    
    onSnapshot(qReceived, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        if(!list) return;
        list.innerHTML = '';

        let hasPending = false;
        snap.forEach(d => {
            const r = d.data();
            if(r.status === 'pending_peer') {
                hasPending = true;
                list.innerHTML += `
                <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250]">
                    <div class="flex justify-between mb-2">
                        <span class="text-sky-400 font-bold text-xs uppercase">${r.requester}</span>
                        <span class="text-xs text-gray-400">Dia ${r.dayIndex+1}</span>
                    </div>
                    <div class="text-xs text-gray-300 italic mb-3">"${r.reason}"</div>
                    <div class="flex gap-2">
                        <button class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1 rounded text-xs hover:bg-green-600 hover:text-white">Aceitar</button>
                        <button class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1 rounded text-xs hover:bg-red-600 hover:text-white">Recusar</button>
                    </div>
                </div>`;
            }
        });

        if (!hasPending) list.innerHTML = '<p class="text-center text-gray-600 text-sm py-4 italic">Nenhuma solicitação pendente.</p>';
    });
}
