// collab-module.js - Lógica Exclusiva do Colaborador
import { db, state } from './config.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export function setupCollaboratorUI() {
    const toolbar = document.getElementById('adminToolbar');
    if(toolbar) toolbar.classList.add('hidden');
    
    document.getElementById('adminEditHint').classList.add('hidden');
    
    const welcome = document.getElementById('welcomeUser');
    welcome.textContent = `Olá, ${state.currentUserName}`;
    welcome.classList.remove('hidden');

    // Configura Abas
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('employeeSelectContainer').classList.add('hidden');
    
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');
}

export async function sendRequest() {
    const btn = document.getElementById('btnSendRequest');
    const type = document.getElementById('reqType').value;
    const targetEmp = document.getElementById('reqTargetEmployee').value;
    let name = document.getElementById('reqEmployeeName').value;
    let idx = parseInt(document.getElementById('reqDateIndex').value);
    
    // Lógica Manual vs Clique
    const manualDate = document.getElementById('reqDateManual').value;
    if (document.getElementById('reqDateDisplay').classList.contains('hidden')) {
        if (!manualDate) { alert("Selecione a data."); return; }
        const dParts = manualDate.split('-');
        idx = parseInt(dParts[2]) - 1;
        name = state.currentUserName;
    }

    const reason = document.getElementById('reqReason').value;
    const needsPeer = (type !== 'troca_turno');

    if(needsPeer && !targetEmp) { alert("Selecione o colega."); return; }
    if(!reason) { alert("Informe o motivo."); return; }

    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const initialStatus = needsPeer ? 'pending_peer' : 'pending_leader';
        await addDoc(collection(db, "solicitacoes"), {
            monthId: `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`,
            requester: name,
            dayIndex: idx,
            type: type,
            target: targetEmp || null,
            reason: reason,
            status: initialStatus, 
            createdAt: serverTimestamp()
        });
        document.getElementById('requestModal').classList.add('hidden');
        alert("Enviado!");
    } catch(e) { console.error(e); alert("Erro."); }
    finally { btn.innerHTML = 'Enviar'; btn.disabled = false; }
}
