// admin-module.js - Lógica Exclusiva do Administrador
import { db, state } from './config.js';
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export function setupAdminUI() {
    const toolbar = document.getElementById('adminToolbar');
    if(toolbar) toolbar.classList.remove('hidden');
    
    document.getElementById('adminEditHint').classList.remove('hidden');
    document.body.style.paddingBottom = "100px";
    
    // Mostra abas permitidas
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); // Admin não pede troca por aqui
    document.getElementById('employeeSelectContainer').classList.remove('hidden');
}

export async function saveToCloud() {
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), state.rawSchedule, { merge: true });
        state.hasUnsavedChanges = false;
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium";
        window.onbeforeunload = null;
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }, 1000);
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar!");
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
    }
}
