import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Função principal chamada pelo app.js
export function initAdminRequestPanel(db) {
    if (!document.getElementById('btnAdminNotifications')) {
        const toolbar = document.querySelector('#adminToolbar > div'); 
        if(toolbar) {
            const btn = document.createElement('button');
            btn.id = 'btnAdminNotifications';
            btn.className = 'relative bg-gray-800 hover:bg-gray-700 text-gray-300 p-2.5 rounded-xl transition-all border border-gray-700 ml-2';
            btn.innerHTML = `<i class="fas fa-bell"></i> <span id="badgeRequests" class="hidden absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white font-bold">0</span>`;
            btn.onclick = toggleRequestModal;
            toolbar.appendChild(btn);
            createAdminModal();
        }
    }

    // Ouve APENAS solicitações prontas para líder (pending_leader)
    const q = query(collection(db, "requests"), where("status", "==", "pending_leader"));
    
    onSnapshot(q, (snapshot) => {
        const badge = document.getElementById('badgeRequests');
        const list = document.getElementById('adminRequestList');
        const count = snapshot.size;
        
        if(badge) {
            badge.textContent = count;
            badge.classList.toggle('hidden', count === 0);
        }

        if(list) {
            list.innerHTML = '';
            if (snapshot.empty) {
                list.innerHTML = '<div class="text-center p-6 text-gray-500">Nenhuma solicitação pendente.</div>';
                return;
            }

            snapshot.forEach(docSnap => {
                const req = docSnap.data();
                const id = docSnap.id;
                
                let contentHTML = '';
                if (req.type === 'shift_change') {
                    contentHTML = `
                        <div class="flex-1">
                            <span class="text-xs font-bold text-purple-400 uppercase">Troca de Turno</span>
                            <p class="text-white font-bold">${req.requester.name}</p>
                            <p class="text-xs text-gray-400">Quer mudar para <strong>${req.details.targetShift}</strong> no dia ${req.details.date}</p>
                            <p class="text-[10px] text-gray-500 italic mt-1">"${req.details.reason}"</p>
                        </div>`;
                } else {
                    contentHTML = `
                        <div class="flex-1">
                            <span class="text-xs font-bold text-orange-400 uppercase">Troca de Folga (Já Aceita pelo Par)</span>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-white font-bold">${req.requester.name}</span>
                                <i class="fas fa-exchange-alt text-gray-600 text-xs"></i>
                                <span class="text-white font-bold">${req.target.name}</span>
                            </div>
                            <p class="text-xs text-gray-400 mt-1">Trocam dias: ${req.details.requesterDate} ↔ ${req.details.targetDate}</p>
                        </div>`;
                }

                const item = document.createElement('div');
                item.className = "bg-[#0F1020] border border-[#2E3250] p-4 rounded-xl flex items-center gap-4 mb-3";
                item.innerHTML = `
                    ${contentHTML}
                    <div class="flex flex-col gap-2">
                        <button onclick="window.approveRequest('${id}')" class="bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg">Aprovar</button>
                        <button onclick="window.rejectRequest('${id}')" class="bg-red-900/50 hover:bg-red-900 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-1.5 rounded-lg">Recusar</button>
                    </div>`;
                list.appendChild(item);
            });
        }
    });

    window.approveRequest = async (docId) => {
        try {
            const reqRef = doc(db, "requests", docId);
            await updateDoc(reqRef, { status: 'approved', approvedAt: new Date().toISOString() });
            alert("Aprovado! Lembre-se de atualizar a escala visualmente.");
        } catch(e) { console.error(e); alert("Erro ao aprovar."); }
    };

    window.rejectRequest = async (docId) => {
        await updateDoc(doc(db, "requests", docId), { status: 'rejected' });
    };
}

function createAdminModal() {
    const modal = document.createElement('div');
    modal.id = 'adminRequestsModal';
    modal.className = 'hidden fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4';
    modal.innerHTML = `
        <div class="bg-[#1A1C2E] border border-[#2E3250] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col relative shadow-2xl animate-fade-in">
            <div class="p-6 border-b border-[#2E3250] flex justify-between items-center">
                <h2 class="text-xl font-bold text-white"><i class="fas fa-tasks mr-2 text-purple-500"></i>Aprovações Pendentes</h2>
                <button onclick="toggleRequestModal()" class="text-gray-500 hover:text-white"><i class="fas fa-times"></i></button>
            </div>
            <div id="adminRequestList" class="p-6 overflow-y-auto custom-scrollbar flex-1"></div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.toggleRequestModal = () => {
    const m = document.getElementById('adminRequestsModal');
    if(m) m.classList.toggle('hidden');
};


