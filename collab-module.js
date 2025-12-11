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
    if(reqType) {
        reqType.onchange = (e) => {
            const targetContainer = document.getElementById('swapTargetContainer');
            // Se for troca de turno, esconde o seletor de colega (pois vai pro líder)
            if (targetContainer) {
                targetContainer.classList.toggle('hidden', e.target.value === 'troca_turno');
            }
        };
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
    // Usamos o confirm nativo temporariamente até criarmos um modal customizado se desejar
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
            let stColor = 'text-gray-400 border-gray-700';
            
            if(r.status === 'pending_peer') { stLabel = 'Aguardando Colega'; stColor = 'text-amber-400 border-amber-500/50 bg-amber-900/10'; }
            if(r.status === 'pending_leader') { stLabel = 'Aguardando Líder'; stColor = 'text-blue-400 border-blue-500/50 bg-blue-900/10'; }
            if(r.status === 'approved') { stLabel = 'Aprovado'; stColor = 'text-emerald-400 border-emerald-500/50 bg-emerald-900/10'; }
            if(r.status === 'rejected') { stLabel = 'Recusado'; stColor = 'text-red-400 border-red-500/50 bg-red-900/10'; }

            const targetDisplay = r.target === 'LÍDER' ? 'Admin/Líder' : r.target;

            list.innerHTML += `
            <div class="bg-[#1A1C2E] p-4 mb-3 rounded-xl border border-[#2E3250] flex justify-between items-center shadow-sm">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs font-bold text-white bg-white/5 px-2 py-0.5 rounded border border-white/10">Dia ${r.dayIndex+1}</span>
                        <span class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">${typeDisplay}</span>
                    </div>
                    <div class="text-xs text-gray-300">Para: <span class="text-white font-semibold">${targetDisplay}</span></div>
                    <div class="text-[10px] text-gray-500 italic mt-1">"${r.reason}"</div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <span class="text-[9px] font-bold uppercase border px-2 py-1 rounded-full ${stColor}">${stLabel}</span>
                </div>
            </div>`;
        });
    });

    // 2. LISTA DE RECEBIDAS (Onde o usuário é o TARGET e precisa aprovar) - DESIGN ATUALIZADO AQUI
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
                
                const typePretty = r.type.replace(/_/g, ' ').toUpperCase();
                
                // NOVO DESIGN DA NOTIFICAÇÃO
                list.innerHTML += `
                <div class="relative bg-gradient-to-br from-[#1A1C2E] to-[#151725] border border-amber-500/30 rounded-2xl p-0 overflow-hidden shadow-lg shadow-amber-900/10 mb-4 group transition-all hover:border-amber-500/50">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                    
                    <div class="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                    <div class="p-5 pl-6">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-2 w-2">
                                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                                <span class="text-amber-400 text-xs font-bold uppercase tracking-widest">Ação Necessária</span>
                            </div>
                            <div class="bg-[#0F1020] border border-white/10 px-3 py-1 rounded-lg text-center min-w-[60px]">
                                <span class="block text-[9px] text-gray-500 uppercase font-bold">Dia</span>
                                <span class="block text-lg font-bold text-white leading-none">${r.dayIndex+1}</span>
                            </div>
                        </div>

                        <div class="mb-4">
                            <h3 class="text-white text-lg font-bold leading-tight mb-1">
                                <span class="text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">${r.requester}</span>
                            </h3>
                            <p class="text-xs text-gray-400 flex items-center gap-1">
                                <i class="fas fa-exchange-alt text-gray-600"></i>
                                Deseja realizar: <strong class="text-gray-300">${typePretty}</strong>
                            </p>
                        </div>

                        <div class="bg-[#0F1020]/50 border border-white/5 rounded-xl p-3 mb-5 relative">
                            <i class="fas fa-quote-left text-gray-700 absolute top-2 left-2 text-xs"></i>
                            <p class="text-sm text-gray-300 italic text-center pl-4 pr-2">"${r.reason}"</p>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <button onclick="window.processCollabRequest('${d.id}','accept')" 
                                class="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-900/20 hover:scale-[1.02]">
                                <i class="fas fa-check"></i> ACEITAR
                            </button>
                            <button onclick="window.processCollabRequest('${d.id}','reject')" 
                                class="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-xs transition-all hover:border-red-500/60">
                                <i class="fas fa-times"></i> RECUSAR
                            </button>
                        </div>
                    </div>
                </div>`;
            }
        });

        if (count === 0) list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-8 text-gray-500 opacity-50">
                <i class="fas fa-inbox text-4xl mb-2"></i>
                <p class="text-xs">Tudo limpo por aqui.</p>
            </div>`;
    });
}
