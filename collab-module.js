// collab-module.js
import { db, state, pad } from './config.js';
import { addDoc, updateDoc, doc, collection, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { updatePersonalView, updateWeekendTable } from './ui.js';

// Variáveis para controlar o Modal de Confirmação
let pendingReqId = null;
let pendingAction = null;

export function initCollabUI() {
    // 1. Limpa UI de Admin
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
    
    if (userName) initRequestsTab(); 
    
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
    
    // Vincula o botão "Sim, Confirmar" do novo modal à função final
    const btnConfirm = document.getElementById('btnConfirmAction');
    if(btnConfirm) btnConfirm.onclick = finalizeAction;

    const reqType = document.getElementById('reqType');
    if(reqType) {
        reqType.onchange = (e) => {
            const targetContainer = document.getElementById('swapTargetContainer');
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

// --- ABERTURA DO MODAL DE CONFIRMAÇÃO (UNIFICADO) ---
window.openConfirmationModal = (reqId, action) => {
    pendingReqId = reqId;
    pendingAction = action;

    const modal = document.getElementById('confirmationModal');
    const topBar = document.getElementById('confirmModalTopBar');
    const iconBg = document.getElementById('confirmModalIconBg');
    const icon = document.getElementById('confirmModalIcon');
    const title = document.getElementById('confirmModalTitle');
    const text = document.getElementById('confirmModalText');
    const btn = document.getElementById('btnConfirmAction');

    // Estilização Dinâmica baseada na Ação
    if (action === 'accept') {
        // Estilo VERDE (Aceitar)
        topBar.className = "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500";
        iconBg.className = "w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-5 border border-green-500/20 animate-pulse-slow";
        icon.className = "fas fa-check text-2xl text-green-400";
        title.textContent = "Aceitar Solicitação?";
        text.textContent = "Você está prestes a aceitar essa troca. O pedido será enviado ao líder.";
        btn.className = "py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold text-sm shadow-lg transition-all transform hover:scale-[1.02]";
        btn.textContent = "Sim, Aceitar";
    } else {
        // Estilo VERMELHO (Recusar)
        topBar.className = "absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500";
        iconBg.className = "w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5 border border-red-500/20 animate-pulse-slow";
        icon.className = "fas fa-times text-2xl text-red-400";
        title.textContent = "Recusar Solicitação?";
        text.textContent = "Tem certeza? Esta ação encerrará a solicitação permanentemente.";
        btn.className = "py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold text-sm shadow-lg transition-all transform hover:scale-[1.02]";
        btn.textContent = "Sim, Recusar";
    }

    modal.classList.remove('hidden');
};

// --- EXECUÇÃO DA AÇÃO (FIREBASE) ---
async function finalizeAction() {
    if (!pendingReqId || !pendingAction) return;

    const btn = document.getElementById('btnConfirmAction');
    const originalText = btn.textContent;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    btn.disabled = true;

    try {
        const reqRef = doc(db, "solicitacoes", pendingReqId);
        
        if (pendingAction === 'accept') {
            await updateDoc(reqRef, { status: 'pending_leader' });
        } else {
            await updateDoc(reqRef, { status: 'rejected' });
        }
        
        document.getElementById('confirmationModal').classList.add('hidden');
        
    } catch (e) {
        console.error(e);
        alert("Erro ao processar: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
        pendingReqId = null;
        pendingAction = null;
    }
}

// --- MODAIS DE SOLICITAÇÃO (CRIAÇÃO) ---
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

async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const type = state.activeRequestType || 'troca_dia_trabalho'; 
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
        
        const isShiftSwap = (type === 'troca_turno');

        if (!isShiftSwap && !targetInput) throw new Error("Selecione com quem deseja trocar.");
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
        document.getElementById('requestSentModal').classList.remove('hidden'); 
        
        document.getElementById('reqReason').value = '';
        document.getElementById('reqTargetEmployee').value = '';

    } catch(e) { 
        alert("Erro: " + e.message); 
    } finally { 
        btn.innerHTML = 'Enviar Solicitação'; btn.disabled = false; 
    }
}

// --- LISTAGEM DE SOLICITAÇÕES ---
function initRequestsTab() {
    if (!state.profile || !state.profile.name) return;

    const docId = `${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    // ENVIADAS
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

    // RECEBIDAS + NOVO DESIGN DO CARD (ESTILO MODAL)
    const qRec = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", state.profile.name));
    onSnapshot(qRec, (snap) => {
        const list = document.getElementById('receivedRequestsList');
        const badge = document.getElementById('requestsBadge');

        if(!list) return;
        list.innerHTML = '';
        let count = 0;

        snap.forEach(d => {
            const r = d.data();
            if(r.status === 'pending_peer') {
                count++;
                const typePretty = r.type.replace(/_/g, ' ').toUpperCase();
                
                // --- NOVO DESIGN: ESTILO "MODAL" (FAIXA SUPERIOR E BOTÕES CHEIOS) ---
                list.innerHTML += `
                <div class="relative bg-[#1A1C2E] border border-cronos-border rounded-2xl shadow-xl overflow-hidden mb-5">
                    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>

                    <div class="p-6">
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-2 text-amber-500 animate-pulse">
                                <i class="fas fa-exclamation-circle text-sm"></i>
                                <span class="text-xs font-bold uppercase tracking-widest">Ação Necessária</span>
                            </div>
                            <div class="bg-[#0F1020] border border-white/10 px-3 py-1 rounded-lg text-center">
                                <span class="block text-[10px] text-gray-500 uppercase font-bold">Dia</span>
                                <span class="block text-xl font-bold text-white">${r.dayIndex+1}</span>
                            </div>
                        </div>

                        <div class="mb-5">
                            <h3 class="text-white text-lg font-bold mb-1">${r.requester}</h3>
                            <p class="text-xs text-gray-400 flex items-center gap-1">
                                <i class="fas fa-exchange-alt"></i> Deseja realizar: <strong class="text-gray-300">${typePretty}</strong>
                            </p>
                        </div>

                        <div class="bg-[#0F1020] border border-white/5 rounded-xl p-4 mb-6 relative">
                            <i class="fas fa-quote-left text-gray-700 absolute top-3 left-3 text-xs"></i>
                            <p class="text-sm text-gray-300 italic text-center px-4">"${r.reason}"</p>
                        </div>

                        <div class="flex gap-3">
                            <button onclick="window.openConfirmationModal('${d.id}','accept')" 
                                class="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/20 transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2">
                                <i class="fas fa-check"></i> ACEITAR
                            </button>
                            <button onclick="window.openConfirmationModal('${d.id}','reject')" 
                                class="flex-1 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-900/10 font-bold text-sm transition-all hover:border-red-500/60 flex items-center justify-center gap-2">
                                <i class="fas fa-times"></i> RECUSAR
                            </button>
                        </div>
                    </div>
                </div>`;
            }
        });

        if(badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        if (count === 0) list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 text-gray-500 opacity-50">
                <i class="fas fa-check-double text-4xl mb-3"></i>
                <p class="text-xs font-bold uppercase">Tudo em dia!</p>
            </div>`;
    });
}
