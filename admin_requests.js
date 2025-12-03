// Este arquivo contém a lógica para o Painel ADMIN visualizar e aprovar solicitações.
// Deve ser integrado ou importado no seu app.js principal se desejar modularizar.

import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Função para iniciar o listener de solicitações pendentes no PAINEL ADMIN
export function initAdminRequestsListener(db, adminUiCallback) {
    // Busca solicitações onde o colega já aceitou (ou era troca de turno) e agora espera o líder
    const q = query(
        collection(db, "solicitacoes"),
        where("status", "==", "PENDING_LEADER")
    );

    onSnapshot(q, (snapshot) => {
        // Chama callback para renderizar na UI do Admin (você precisa criar uma div #adminRequestsList no index.html)
        const requests = [];
        snapshot.forEach(d => requests.push({ id: d.id, ...d.data() }));
        adminUiCallback(requests);
    });
}

// Função executada quando o LÍDER clica em "Aprovar"
export async function approveRequest(db, reqId, reqData) {
    const solRef = doc(db, "solicitacoes", reqId);
    const escalaRef = doc(db, "escalas", reqData.monthDocId);
    
    try {
        // 1. Atualizar o documento de escala real
        const escalaSnap = await getDoc(escalaRef);
        if(escalaSnap.exists()) {
            const escalaFull = escalaSnap.data();
            
            // Lógica de Troca
            // Aqui precisaria implementar a lógica exata de alterar o array 'schedule' do usuário no dia específico
            // Exemplo simplificado:
            const dayIndex = parseInt(reqData.date.split('-')[2]) - 1; // '2025-10-15' -> 14
            
            if(reqData.type === 'TROCA_COLEGA') {
                // Troca status entre Requester e Target
                const requesterSched = escalaFull[reqData.requester].schedule; // Assumindo que já está salvo
                const targetSched = escalaFull[reqData.target].schedule;
                
                // Swap
                const temp = requesterSched[dayIndex];
                requesterSched[dayIndex] = targetSched[dayIndex];
                targetSched[dayIndex] = temp;
                
                // Salvar de volta
                await updateDoc(escalaRef, {
                    [`${reqData.requester}.calculatedSchedule`]: requesterSched,
                    [`${reqData.target}.calculatedSchedule`]: targetSched
                    // Nota: Idealmente atualizaria também a string T/F original se necessário
                });
            } else {
                // Troca de Turno (apenas altera info ou status)
                // Implementar conforme regra de negócio
            }
        }

        // 2. Atualizar status da solicitação
        await updateDoc(solRef, { status: 'APPROVED' });
        alert("Solicitação Aprovada e Escala Atualizada!");
        
    } catch (e) {
        console.error("Erro na aprovação:", e);
        alert("Erro ao aprovar.");
    }
}

export async function rejectRequest(db, reqId) {
    await updateDoc(doc(db, "solicitacoes", reqId), { status: 'REJECTED' });
}
