// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

// --- INICIALIZAÇÃO DA UI ---
export function initCollabUI() {
    // 1. Limpa UI de Admin
    const adminToolbar = document.getElementById('adminToolbar');
    const adminEditHint = document.getElementById('adminEditHint');
    const employeeSelect = document.getElementById('employeeSelectContainer');

    if(adminToolbar) adminToolbar.classList.add('hidden');
    if(adminEditHint) adminEditHint.classList.add('hidden');
    if(employeeSelect) employeeSelect.classList.add('hidden');
    
    // 2. Mostra Saudação e Verifica Perfil
    const welcome = document.getElementById('welcomeUser');
    
    // SEGURANÇA: Se não tiver perfil carregado, não tenta renderizar coisas que dependem do nome
    if (!state.profile || !state.profile.name) {
        console.error("ERRO: Perfil de colaborador inválido ou sem nome.", state.profile);
        if(welcome) welcome.textContent = "Olá, Colaborador (Perfil incompleto)";
        // Não retorna para permitir que o resto da UI carregue, mas avisa no console
    } else {
        if(welcome) {
            welcome.textContent = `Olá, ${state.profile.name}`;
            welcome.classList.remove('hidden');
        }
    }

    // 3. Configura Abas
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');

    // 4. Carrega dados visuais
    if(state.profile && state.profile.name) {
        updatePersonalView(state.profile.name);
    }
    
    updateWeekendTable(null); 
    
    // 5. Inicia Listeners
    initRequestsTab(); 
    setupEventListeners();
}

function setupEventListeners() {
    const btnNew = document.getElementById('btnNewRequestDynamic');
    if(btnNew) {
        const newBtn = btnNew.cloneNode(true);
        btnNew.parentNode.replaceChild(newBtn, btnNew);
        newBtn.onclick = openManualRequestModal;
    }

    const btnSend = document.getElementById('btnSendRequest');
    if(btnSend) {
        // Remove listeners antigos para evitar duplo envio
        const newBtnSend = btnSend.cloneNode(true);
        btnSend.parentNode.replaceChild(newBtnSend, btnSend);
        newBtnSend.onclick = sendRequest;
    }

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
        Object.keys(state.scheduleData).sort().forEach(n => { 
            // Proteção se profile.name for undefined
            const myName = state.profile ? state.profile.name : '';
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
        
        if(!name) throw new Error("Erro de identificação do usuário. Recarregue a página.");

        if(!idx) {
            const manualDate = document.getElementById('reqDateManual').value;
            if(!manualDate) throw new Error("Por favor, selecione uma data.");
            idx = parseInt(manualDate.split('-')[2]) - 1;
        } else {
            idx = parseInt(idx);
        }

        const target = document.getElementById('reqTargetEmployee').value;
        const reason = document.getElementById('reqReason').value;
        const needsPeer = (type !== 'troca_turno'); 

        if(needsPeer && !target) throw new Error("Selecione com quem deseja trocar.");
        if(!reason) throw new Error("Informe o motivo da solicitação.");

        const initialStatus = needsPeer ? 'pending_peer' : 'pending_leader';

        // CORREÇÃO DE FORMATO DO ID (Mesmo do Admin: YYYY-MM)
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
        alert("Solicitação enviada com sucesso!");
        
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar Solicitação'; 
        btn.disabled = false; 
    }
}

// --- LISTAGEM DE SOLICITAÇÕES (CORRIGIDA) ---
function initRequestsTab() {
    // 1. SEGURANÇA: Se não tiver nome, não tenta buscar no banco (causa o erro undefined)
    if (!state.profile || !state.profile.name) {
        console.warn("Aba de solicitações pausada: Nome do perfil não encontrado.");
        return;
    }

    // 2. CORREÇÃO DO ID (YYYY-MM)
    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // 3. Queries
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", state.profile.name));
    
    onSnapshot(qSent, (snap) => {
        const list = document.getElementById('sentRequestsList');
        if(!list) return;
        list.innerHTML = '';
        
        if (snap.empty) {
            list.innerHTML = '<p class="text-center text-gray-600 text-sm py-4 italic">Você não tem solicitações enviadas.</p>';
        }

        snap.forEach(d => {
            const r = d.data();
            const statusLabels = { 'pending_peer': 'Aguardando Colega', 'pending_leader': 'Aguardando Líder', 'approved': 'Aprovado', 'rejected': 'Recusado' };
            const statusColors = { 'pending_peer': 'text-yellow-500', 'pending_leader': 'text-blue-400', 'approved': 'text-green-400', 'rejected': 'text-red-400' };
            
            list.innerHTML += `
            <div class="bg-[#0F1020] p-3 mb-2 rounded-lg border border-[#2E3250] flex justify-between items-center">
                <div>
                    <div class="text-xs text-gray-400">Dia ${r.dayIndex+1} • ${r.type.replace(/_/g, ' ')}</div>
                    <div class="text-xs text-gray-500 italic">"${r.reason}"</div>
                </div>
                <span class="text-[10px] font-bold uppercase ${statusColors[r.status] || 'text-gray-400'}">${statusLabels[r.status] || r.status}</span>
            </div>`;
        });
    });

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
                        <button onclick="window.processCollabRequest('${d.id}','accept')" class="flex-1 bg-green-600/20 text-green-400 border border-green-600/50 py-1.5 rounded text-xs font-bold hover:bg-green-600 hover:text-white transition">Aceitar</button>
                        <button onclick="window.processCollabRequest('${d.id}','reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Recusar</button>
                    </div>
                </div>`;
            }
        });

        if (!hasPending) {
            list.innerHTML = '<p class="text-center text-gray-600 text-sm py-4 italic">Nenhuma solicitação recebida.</p>';
        }
    });
}
