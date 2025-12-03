import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- Configuração ---
const firebaseConfig = {
  apiKey: "AIzaSyCBKSPH7lfUt0VsQPhJX3a0CQ2wYcziQvM",
  authDomain: "dadosescala.firebaseapp.com",
  projectId: "dadosescala",
  storageBucket: "dadosescala.firebasestorage.app",
  messagingSenderId: "117221956502",
  appId: "1:117221956502:web:e5a7f051daf3306b501bb7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado
let currentUser = null; // Armazena o nome do usuário logado
let currentSchedule = [];
const currentDate = new Date();
const currentMonthStr = `escala-${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}`;

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserList();
    checkSession();
});

// 1. Login Simulado (Para identificar o colaborador)
const loginForm = document.getElementById('colabLoginForm');
const selectUsers = document.getElementById('loginNameSelect');

async function loadUserList() {
    // Busca nomes do documento de escala atual para preencher o select
    try {
        const docRef = doc(db, "escalas", currentMonthStr);
        const snap = await getDoc(docRef);
        if(snap.exists()) {
            const data = snap.data();
            const names = Object.keys(data).sort();
            selectUsers.innerHTML = '<option value="">Selecione seu nome...</option>';
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                selectUsers.appendChild(opt);
                
                // Preencher também o select de troca com colegas (modal de solicitação)
                const targetSelect = document.getElementById('swapTargetUser');
                if(targetSelect) {
                    const opt2 = opt.cloneNode(true);
                    targetSelect.appendChild(opt2);
                }
            });
        }
    } catch (e) {
        console.error("Erro ao carregar usuários", e);
    }
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = selectUsers.value;
    const pass = document.getElementById('loginPassword').value;

    if(!name) return alert("Selecione seu nome.");
    
    // Autenticação Simplificada (Em produção, usar Firebase Auth com email)
    // Aqui assumimos que qualquer senha serve para demonstração, ou você pode fixar uma
    if(pass.length < 3) return alert("Código inválido.");

    currentUser = name;
    localStorage.setItem('sitelbra_colab_user', name);
    showDashboard();
});

function checkSession() {
    const saved = localStorage.getItem('sitelbra_colab_user');
    if(saved) {
        currentUser = saved;
        showDashboard();
    }
}

document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('sitelbra_colab_user');
    window.location.reload();
});

function showDashboard() {
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = currentUser;

    loadMySchedule();
    listenToMyRequests();
    listenToIncomingRequests();
}

// 2. Carregar Escala Pessoal
async function loadMySchedule() {
    try {
        const docRef = doc(db, "escalas", currentMonthStr);
        const snap = await getDoc(docRef);
        
        if(snap.exists()) {
            const data = snap.data();
            const myData = data[currentUser];
            if(!myData) return;

            // Lógica simplificada de renderização (similar ao app.js principal)
            const grid = document.getElementById('myCalendarGrid');
            grid.innerHTML = '';
            
            // Assume que o array calculado já existe ou recria (simplificado aqui para demo)
            // Na prática, você deve copiar a função buildFinalScheduleForMonth do app.js
            // Aqui vamos apenas listar dias se existirem, ou usar um placeholder
            
            // Renderização simplificada de dias 1 a 30/31
            const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 0).getDate();
            
            // Recriar array básico se não existir no banco
            let schedule = myData.calculatedSchedule || Array(daysInMonth).fill('F');
            
            schedule.forEach((status, i) => {
                const day = i + 1;
                const div = document.createElement('div');
                div.className = "bg-[#0F1020] border border-[#2E3250] rounded flex flex-col items-center justify-center p-2 min-h-[60px]";
                
                let colorClass = 'text-gray-400';
                if(status === 'T') colorClass = 'text-green-400 font-bold';
                if(status === 'F') colorClass = 'text-yellow-500';
                if(status === 'FE') colorClass = 'text-red-500';

                div.innerHTML = `
                    <span class="text-xs text-gray-600">${day}</span>
                    <span class="text-sm ${colorClass}">${status}</span>
                `;
                grid.appendChild(div);
            });
        }
    } catch (e) {
        console.error(e);
    }
}

// 3. Sistema de Solicitações

// 3.1 Criar Troca de Turno (Vai para Líder)
document.getElementById('formShiftChange').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('shiftDate').value;
    const targetShift = document.getElementById('shiftTarget').value;
    const reason = document.getElementById('shiftReason').value;

    if(!date) return alert("Selecione uma data");

    const btn = e.target.querySelector('button');
    btn.textContent = "Enviando...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "solicitacoes"), {
            type: 'TROCA_TURNO',
            requester: currentUser,
            date: date,
            details: `Mudança para ${targetShift}. Motivo: ${reason}`,
            status: 'PENDING_LEADER', // Karina -> Líder
            createdAt: serverTimestamp(),
            monthDocId: currentMonthStr
        });
        alert("Solicitação enviada ao Líder!");
        e.target.reset();
    } catch (err) {
        alert("Erro ao enviar.");
        console.error(err);
    } finally {
        btn.textContent = "Solicitar ao Líder";
        btn.disabled = false;
    }
});

// 3.2 Criar Troca com Colega (Vai para Colega primeiro)
document.getElementById('formPeerSwap').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('swapDate').value;
    const targetUser = document.getElementById('swapTargetUser').value;
    const reason = document.getElementById('swapReason').value;

    if(!date || !targetUser) return alert("Preencha todos os campos.");
    if(targetUser === currentUser) return alert("Não pode trocar com você mesmo.");

    const btn = e.target.querySelector('button');
    btn.textContent = "Enviando...";
    btn.disabled = true;

    try {
        await addDoc(collection(db, "solicitacoes"), {
            type: 'TROCA_COLEGA',
            requester: currentUser,
            target: targetUser, // Gabriel Procópio
            date: date,
            details: reason,
            status: 'PENDING_PEER', // Karina -> Gabriel
            createdAt: serverTimestamp(),
            monthDocId: currentMonthStr
        });
        alert(`Notificação enviada para ${targetUser}. Aguarde o aceite dele.`);
        e.target.reset();
    } catch (err) {
        alert("Erro ao enviar.");
        console.error(err);
    } finally {
        btn.textContent = "Solicitar ao Colega";
        btn.disabled = false;
    }
});

// 4. Listeners (Tempo Real)

// Monitorar solicitações que EU fiz
function listenToMyRequests() {
    const q = query(collection(db, "solicitacoes"), where("requester", "==", currentUser));
    
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('sentRequestsList');
        list.innerHTML = '';
        if(snapshot.empty) {
            list.innerHTML = '<p class="text-gray-500 text-sm italic">Nenhuma solicitação.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const statusColors = {
                'PENDING_PEER': 'text-yellow-500', // Aguardando Gabriel
                'PENDING_LEADER': 'text-purple-400', // Gabriel aceitou, aguardando Líder
                'APPROVED': 'text-green-500',
                'REJECTED': 'text-red-500'
            };
            const statusLabels = {
                'PENDING_PEER': `Aguardando ${data.target}`,
                'PENDING_LEADER': 'Aguardando Líder',
                'APPROVED': 'Aprovado',
                'REJECTED': 'Recusado'
            };

            const item = document.createElement('div');
            item.className = "bg-[#0F1020] p-3 rounded border border-[#2E3250] flex justify-between items-center";
            item.innerHTML = `
                <div>
                    <p class="text-sm font-bold text-gray-300">${data.type === 'TROCA_TURNO' ? 'Troca Turno' : 'Troca com ' + data.target}</p>
                    <p class="text-xs text-gray-500">Dia ${data.date}</p>
                </div>
                <div class="text-right">
                    <span class="text-xs font-bold ${statusColors[data.status] || 'text-gray-400'} block">
                        ${statusLabels[data.status] || data.status}
                    </span>
                    <button class="text-[10px] text-red-400 hover:underline mt-1" onclick="deleteReq('${docSnap.id}')">Cancelar</button>
                </div>
            `;
            list.appendChild(item);
        });
    });
}

// Monitorar solicitações PARA MIM (Gabriel vendo pedido da Karina)
function listenToIncomingRequests() {
    // Busca onde EU sou o alvo (target) e o status é PENDING_PEER
    const q = query(
        collection(db, "solicitacoes"), 
        where("target", "==", currentUser), 
        where("status", "==", "PENDING_PEER")
    );

    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('incomingRequestsList');
        const badge = document.getElementById('badgeNotifications');
        list.innerHTML = '';

        if(snapshot.empty) {
            badge.classList.add('hidden');
            list.innerHTML = '<p class="text-gray-500 text-sm italic">Nenhuma pendência.</p>';
            return;
        }

        badge.classList.remove('hidden');

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = "bg-[#2E3250] p-4 rounded-xl border border-yellow-500/30 shadow-lg animate-pulse";
            item.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <h4 class="font-bold text-white"><i class="fas fa-user-friends text-pink-400 mr-2"></i>Solicitação de Troca</h4>
                    <span class="bg-yellow-500/20 text-yellow-400 text-[10px] px-2 py-1 rounded border border-yellow-500/30">PENDENTE</span>
                </div>
                <p class="text-sm text-gray-300 mb-2">
                    <strong class="text-white">${data.requester}</strong> quer trocar o dia 
                    <strong class="text-white">${data.date}</strong> com você.
                </p>
                <p class="text-xs text-gray-500 mb-4 bg-[#0F1020] p-2 rounded italic">"${data.details || 'Sem observações'}"</p>
                
                <div class="flex gap-2">
                    <button onclick="handlePeerResponse('${docSnap.id}', true)" class="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded transition-colors">
                        <i class="fas fa-check mr-1"></i> Aceitar
                    </button>
                    <button onclick="handlePeerResponse('${docSnap.id}', false)" class="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded transition-colors">
                        <i class="fas fa-times mr-1"></i> Recusar
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
    });
}

// Funções globais para uso no HTML
window.deleteReq = async (id) => {
    if(confirm("Cancelar solicitação?")) {
        // Na pratica usaria deleteDoc
        alert("Função de deletar simulada. Implementar deleteDoc(doc(db, 'solicitacoes', id))");
    }
}

window.handlePeerResponse = async (docId, accepted) => {
    const docRef = doc(db, "solicitacoes", docId);
    if(accepted) {
        // Se Gabriel aceitar, muda status para PENDING_LEADER (vai para o Admin)
        await updateDoc(docRef, {
            status: 'PENDING_LEADER',
            peerResponseAt: serverTimestamp()
        });
        alert("Você aceitou! A solicitação foi enviada para aprovação do Líder.");
    } else {
        await updateDoc(docRef, {
            status: 'REJECTED',
            rejectionReason: 'Recusado pelo colega.'
        });
        alert("Solicitação recusada.");
    }
}
