import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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
const auth = getAuth(app);

// Estado Global
let currentUser = null;
let myScheduleName = null; // O nome exato que está na escala (ex: "Karina")
let currentScheduleData = {};
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Sábado','FD':'Domingo','FE':'Férias' };

// --- Auth & Inicialização ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('userEmail').textContent = user.email;
        // Tenta descobrir o nome do usuário na escala baseada no cadastro ou email
        // Para simplificar MVP, assumiremos que o displayName do Auth ou parte do email é o nome
        // Ideal: Ter uma collection 'users' mapeando uid -> nome_na_escala
        await identifyUserInSchedule();
        initDashboard();
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "login.html");
});

// --- Lógica Principal ---

async function identifyUserInSchedule() {
    // 1. Carrega a escala atual
    const d = new Date();
    const docId = `escala-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    
    try {
        const docSnap = await getDoc(doc(db, "escalas", docId));
        if(docSnap.exists()) {
            const data = docSnap.data();
            currentScheduleData = data;
            
            // Tenta encontrar o nome. 
            // PROVISÓRIO: Procura um nome na escala que contenha parte do email ou nome do auth
            // Em produção: Usar mapeamento exato no DB.
            const searchKey = currentUser.email.split('@')[0].toLowerCase();
            const foundName = Object.keys(data).find(k => k.toLowerCase().includes(searchKey));
            
            if(foundName) {
                myScheduleName = foundName;
                document.getElementById('userDisplayName').textContent = foundName;
                populateSwapSelect(Object.keys(data));
            } else {
                myScheduleName = "Desconhecido"; // Fallback para teste
                alert("Seu usuário não foi vinculado automaticamente à escala. Contate o admin.");
            }
        }
    } catch(e) {
        console.error("Erro ao ler escala:", e);
    }
}

function initDashboard() {
    renderMyCalendar();
    listenToMyRequests();
    listenToActionableRequests(); // Solicitações que eu preciso responder
}

// --- Renderização da Escala ---
function renderMyCalendar() {
    if(!myScheduleName || !currentScheduleData[myScheduleName]) return;

    const empData = currentScheduleData[myScheduleName];
    // Reutiliza a lógica de gerar array do app.js (simplificada aqui)
    const scheduleArr = buildScheduleArray(empData);
    
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    const d = new Date();
    const today = d.getDate();
    
    // Atualiza Status de Hoje
    const todayStatus = scheduleArr[today-1];
    document.getElementById('todayStatus').textContent = statusMap[todayStatus] || todayStatus;
    document.getElementById('todayStatus').className = `text-3xl font-extrabold mb-4 ${getStatusColor(todayStatus)}`;

    document.getElementById('currentMonthLabel').textContent = `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    scheduleArr.forEach((st, idx) => {
        const day = idx + 1;
        const cell = document.createElement('div');
        const isToday = day === today;
        
        // Estilo da Célula
        let bgClass = "bg-[#1A1C2E]";
        if(st === 'T') bgClass = "bg-green-900/20 border-green-500/30 text-green-400";
        else if(st.startsWith('F')) bgClass = "bg-yellow-900/20 border-yellow-500/30 text-yellow-500";
        if(st === 'FS') bgClass = "bg-sky-900/20 border-sky-500/30 text-sky-400";
        if(st === 'FD') bgClass = "bg-indigo-900/20 border-indigo-500/30 text-indigo-400";
        
        if(isToday) bgClass += " ring-2 ring-white";

        cell.className = `flex flex-col items-center justify-center p-3 rounded-xl border ${bgClass} transition-transform hover:scale-105`;
        cell.innerHTML = `
            <span class="text-xs font-bold opacity-70">Dia</span>
            <span class="text-lg font-bold">${day}</span>
            <span class="text-[10px] uppercase tracking-wider mt-1 font-bold">${st}</span>
        `;
        grid.appendChild(cell);
    });
}

// --- Solicitações (Requests) ---

// 1. Ouvir Minhas Solicitações (Histórico)
function listenToMyRequests() {
    // Filtra requests onde eu sou o solicitante (requesterId == uid)
    const q = query(collection(db, "requests"), where("requesterId", "==", currentUser.uid), where("status", "!=", "deleted")); // requer indice composto as vezes, se der erro use client side filter
    
    // Simplificando query para evitar erro de indice no inicio:
    const qSimple = query(collection(db, "requests"), where("requesterId", "==", currentUser.uid));

    onSnapshot(qSimple, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        list.innerHTML = '';
        if(snapshot.empty) {
            list.innerHTML = '<li class="text-center text-xs text-gray-600 py-4">Nenhuma solicitação.</li>';
            return;
        }

        snapshot.forEach(doc => {
            const r = doc.data();
            const date = r.createdAt ? new Date(r.createdAt.seconds * 1000).toLocaleDateString() : '--';
            
            let statusColor = "text-yellow-500";
            let statusText = "Pendente Admin";
            
            if(r.status === 'pending_peer') { statusText = "Aguardando Colega"; statusColor = "text-pink-400"; }
            if(r.status === 'approved') { statusText = "Aprovado"; statusColor = "text-green-400"; }
            if(r.status === 'rejected') { statusText = "Rejeitado"; statusColor = "text-red-400"; }

            const li = document.createElement('li');
            li.className = "bg-[#0F1020] border border-[#2E3250] rounded-lg p-3 flex justify-between items-center";
            li.innerHTML = `
                <div>
                    <p class="text-xs font-bold text-white uppercase">${r.type === 'swap' ? 'Troca c/ ' + r.targetName : 'Troca Turno'}</p>
                    <p class="text-[10px] text-gray-500">${date} • ${r.details}</p>
                </div>
                <span class="text-[10px] font-bold ${statusColor} border border-current px-2 py-0.5 rounded">${statusText}</span>
            `;
            list.appendChild(li);
        });
    });
}

// 2. Ouvir Solicitações Onde EU sou o alvo (Target) - Peer Review
function listenToActionableRequests() {
    // Solicitações onde alguém quer trocar COMIGO e status é pending_peer
    // Obs: Idealmente buscar por targetUserId, mas se não tivermos UIDs mapeados, usar targetName
    const q = query(collection(db, "requests"), where("targetName", "==", myScheduleName), where("status", "==", "pending_peer"));

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('actionAlertContainer');
        container.innerHTML = '';
        
        if(snapshot.empty) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        snapshot.forEach(docSnap => {
            const r = docSnap.data();
            const alert = document.createElement('div');
            alert.className = "bg-gradient-to-r from-pink-900/40 to-purple-900/40 border border-pink-500/30 rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 mb-2 animate-pulse";
            alert.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400"><i class="fas fa-bell"></i></div>
                    <div>
                        <h4 class="font-bold text-white">Solicitação de Troca</h4>
                        <p class="text-sm text-gray-300"><strong>${r.employeeName}</strong> quer trocar o dia <strong>${r.originalDate}</strong> pelo seu dia <strong>${r.targetDate}</strong>.</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="window.replyPeer('${docSnap.id}', false)" class="px-4 py-2 rounded-lg bg-[#0F1020] hover:bg-red-900/30 text-gray-300 hover:text-red-400 text-xs font-bold border border-[#2E3250] transition-colors">Recusar</button>
                    <button onclick="window.replyPeer('${docSnap.id}', true)" class="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold shadow-lg transition-colors">Aceitar Troca</button>
                </div>
            `;
            container.appendChild(alert);
        });
    });
}

// --- Funções Globais (Window) ---

// Responder a colega (Aceitar = vai para admin, Recusar = finaliza)
window.replyPeer = async (reqId, accepted) => {
    try {
        await updateDoc(doc(db, "requests", reqId), {
            status: accepted ? 'pending' : 'rejected', // Se aceitar, vira 'pending' para o admin ver. Se recusar, vira 'rejected'.
            peerResponseAt: serverTimestamp(),
            peerResponseBy: myScheduleName
        });
        alert(accepted ? "Aceito! Agora aguarda aprovação do líder." : "Solicitação recusada.");
    } catch(e) {
        console.error(e);
        alert("Erro ao responder.");
    }
};

window.openModal = (type) => document.getElementById(type === 'shift' ? 'modalShift' : 'modalSwap').classList.add('open');
window.closeModal = (type) => document.getElementById(type === 'shift' ? 'modalShift' : 'modalSwap').classList.remove('open');

// Submissão Troca de Turno (Colaborador -> Admin)
document.getElementById('formShiftChange').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('shiftDate').value;
    const newTime = document.getElementById('shiftNewTime').value;
    const reason = document.getElementById('shiftReason').value;

    try {
        await addDoc(collection(db, "requests"), {
            requesterId: currentUser.uid,
            employeeName: myScheduleName,
            type: 'troca_turno',
            details: `Dia ${date}: Mudar para ${newTime}. Motivo: ${reason}`,
            status: 'pending', // Vai direto para admin
            createdAt: serverTimestamp()
        });
        window.closeModal('shift');
        e.target.reset();
        alert("Solicitação enviada ao líder!");
    } catch (e) { console.error(e); alert("Erro ao enviar."); }
});

// Submissão Troca com Colega (Colaborador A -> Colaborador B)
document.getElementById('formSwap').addEventListener('submit', async (e) => {
    e.preventDefault();
    const myDate = document.getElementById('swapMyDate').value;
    const targetUser = document.getElementById('swapTargetUser').value;
    const targetDate = document.getElementById('swapTargetDate').value;

    if(!targetUser) return alert("Selecione um colega.");

    try {
        await addDoc(collection(db, "requests"), {
            requesterId: currentUser.uid,
            employeeName: myScheduleName,
            type: 'swap',
            targetName: targetUser, // Nome do colega alvo
            originalDate: myDate,
            targetDate: targetDate,
            details: `Troca com ${targetUser}: Dia ${myDate} x Dia ${targetDate}`,
            status: 'pending_peer', // STATUS ESPECIAL: Aguarda colega
            createdAt: serverTimestamp()
        });
        window.closeModal('swap');
        e.target.reset();
        alert(`Solicitação enviada para ${targetUser}. Aguarde ele aceitar.`);
    } catch (e) { console.error(e); alert("Erro ao enviar."); }
});

// Helpers
function buildScheduleArray(empData) {
    // Versão mini do gerador de array para visualização
    // Para simplificar, gera apenas um array de 31 posições dummy ou tenta ler do objeto se tiver T, FE, etc.
    // O ideal é importar a função exata do app.js, mas aqui vou replicar a lógica básica
    const totalDays = 31; 
    const arr = new Array(totalDays).fill('F');
    // ... (implementar parsing básico similar ao admin.js se quiser precisão exata, 
    // ou apenas assumir T nos dias úteis para MVP visual)
    if(empData.T) {
        // Mock rápido: Preenche dias úteis como T
        for(let i=0; i<totalDays; i++) {
            const d = i+1;
            const dow = new Date(new Date().getFullYear(), new Date().getMonth(), d).getDay();
            if(dow !== 0 && dow !== 6) arr[i] = 'T';
        }
    }
    return arr;
}

function getStatusColor(st) {
    if(st === 'T') return "text-green-500";
    if(st === 'FE') return "text-red-500";
    return "text-yellow-500";
}

function populateSwapSelect(allNames) {
    const sel = document.getElementById('swapTargetUser');
    sel.innerHTML = '<option value="">Selecione o colega...</option>';
    allNames.forEach(n => {
        if(n !== myScheduleName) {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            sel.appendChild(opt);
        }
    });
}
