import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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

let currentUserData = null;
let currentSchedule = [];

// --- Autenticação e Inicialização ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Tenta obter o nome do usuário a partir do Auth ou de uma collection de users se existir
        // Para este MVP, usaremos o displayName do Auth, assumindo que foi setado ou é o email
        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email.split('@')[0] // Fallback simples
        };
        document.getElementById('userDisplayName').textContent = `Olá, ${currentUserData.name}`;
        
        initCalendar();
        loadMyRequests();
        listenToPeerRequests();
        populatePeerSelect();
    } else {
        window.location.href = 'login.html';
    }
});

document.getElementById('btnLogout').addEventListener('click', () => signOut(auth));

// --- 1. Calendário e Escala ---
async function initCalendar() {
    // Carrega a escala do mês atual (Lógica similar ao app.js mas filtrada)
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    
    // Atualiza Selector de Mês (Simplificado para atual e próximo)
    const sel = document.getElementById('monthSelector');
    sel.innerHTML = `
        <option value="${date.getFullYear()}-${date.getMonth()}">Atual (${date.getMonth()+1}/${date.getFullYear()})</option>
    `;

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Procura o nome do usuário nas chaves do documento
            // IMPORTANTE: O nome no Auth deve bater com o nome na planilha/banco
            // Aqui fazemos uma busca "case insensitive" aproximada
            const scheduleKey = Object.keys(data).find(k => k.toLowerCase() === currentUserData.name.toLowerCase()) || currentUserData.name;
            
            if (data[scheduleKey]) {
                renderCalendar(data[scheduleKey], date);
            } else {
                showToast("Sua escala não foi encontrada para este mês.");
            }
        }
    } catch (e) {
        console.error("Erro ao carregar escala:", e);
    }
}

function renderCalendar(userScheduleData, dateObj) {
    const grid = document.getElementById('myCalendarGrid');
    grid.innerHTML = '';
    const totalDays = new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
    const firstDayDow = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay();

    // Fill Empty
    for(let i=0; i<firstDayDow; i++) grid.innerHTML += `<div class="bg-[#1A1C2E] min-h-[60px] opacity-30"></div>`;

    // Parse Schedule (Lógica Simplificada para Demo - Assume array ou string T/F)
    // *Na produção, usar a mesma função complexa do app.js (buildFinalScheduleForMonth)*
    // Aqui vamos assumir que userScheduleData.calculatedSchedule existe ou simular
    
    // Simulação visual simples baseada no app.js anterior
    for(let d=1; d<=totalDays; d++) {
        // Lógica dummy para visualização se não tiver calculatedSchedule salvo
        const isWeekend = new Date(dateObj.getFullYear(), dateObj.getMonth(), d).getDay() % 6 === 0;
        let status = isWeekend ? 'F' : 'T'; 
        
        // Se a lógica completa do app.js estivesse aqui, usaríamos ela.
        // Vamos tentar ler arrays T e F se existirem
        if (userScheduleData.T && Array.isArray(userScheduleData.T) && userScheduleData.T.includes(d)) status = 'T';
        if (userScheduleData.F && Array.isArray(userScheduleData.F) && userScheduleData.F.includes(d)) status = 'F';

        const colorClass = status === 'T' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
        
        grid.innerHTML += `
            <div class="bg-[#161828] min-h-[60px] p-2 border border-[#2E3250] flex flex-col justify-between">
                <span class="text-xs font-mono text-gray-500">${d}</span>
                <span class="text-[10px] font-bold px-1 rounded border ${colorClass} text-center w-full">${status}</span>
            </div>
        `;
    }
}

// --- 2. Solicitações (Requests) ---

// Tipo 1: Troca de Turno (Vai direto para Líder)
document.getElementById('formShiftSwap').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('shiftDate').value;
    const shift = document.getElementById('targetShift').value;
    const reason = document.getElementById('shiftReason').value;

    try {
        await addDoc(collection(db, "requests"), {
            type: 'shift_change',
            requester: { uid: currentUserData.uid, name: currentUserData.name, email: currentUserData.email },
            details: { date, targetShift: shift, reason },
            status: 'pending_leader', // Pula validação de par, vai para admin
            createdAt: new Date().toISOString()
        });
        window.closeModal('shiftSwapModal');
        showToast("Solicitação enviada para aprovação do líder!");
    } catch (error) {
        console.error(error);
        showToast("Erro ao enviar solicitação.");
    }
});

// Tipo 2: Troca de Folga (Precisa de aceite do colega PRIMEIRO)
document.getElementById('formPeerSwap').addEventListener('submit', async (e) => {
    e.preventDefault();
    const myDate = document.getElementById('myOffDate').value;
    const peerDate = document.getElementById('peerOffDate').value;
    const peerName = document.getElementById('peerSelect').value;

    if(!peerName) return;

    try {
        await addDoc(collection(db, "requests"), {
            type: 'day_off_swap',
            requester: { uid: currentUserData.uid, name: currentUserData.name, email: currentUserData.email },
            target: { name: peerName }, // Na versão final, idealmente usar UID ou Email
            details: { 
                requesterDate: myDate, 
                targetDate: peerDate 
            },
            status: 'pending_peer', // STATUS INICIAL: Esperando o colega Gabriel aceitar
            createdAt: new Date().toISOString()
        });
        window.closeModal('dayOffSwapModal');
        showToast(`Solicitação enviada para ${peerName}. Aguardando aceite.`);
    } catch (error) {
        console.error(error);
        showToast("Erro ao enviar.");
    }
});

// --- 3. Listener de Solicitações Recebidas (Sou o Gabriel) ---
let currentPeerRequestDocId = null;

function listenToPeerRequests() {
    const q = query(
        collection(db, "requests"), 
        where("target.name", "==", currentUserData.name), // Busca por nome (MVP)
        where("status", "==", "pending_peer")
    );

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('peerRequestsContainer');
        if (!snapshot.empty) {
            const docData = snapshot.docs[0].data();
            currentPeerRequestDocId = snapshot.docs[0].id;
            
            document.getElementById('peerRequestText').innerHTML = 
                `<strong class="text-white">${docData.requester.name}</strong> propôs trocar a folga dele(a) do dia <span class="text-purple-400 font-mono">${formatDate(docData.details.requesterDate)}</span> pela sua do dia <span class="text-orange-400 font-mono">${formatDate(docData.details.targetDate)}</span>.`;
            
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
            currentPeerRequestDocId = null;
        }
    });
}

// Ações do "Gabriel" (Aceitar/Recusar troca)
document.getElementById('btnAcceptPeer').addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try {
        const ref = doc(db, "requests", currentPeerRequestDocId);
        // Ao aceitar, o status muda para pending_leader para o chefe aprovar
        await updateDoc(ref, { 
            status: 'pending_leader',
            'target.uid': currentUserData.uid, // Grava quem aceitou de fato
            peerAcceptedAt: new Date().toISOString()
        });
        showToast("Você aceitou! Agora aguarde a aprovação do líder.");
    } catch(e) { console.error(e); }
});

document.getElementById('btnDenyPeer').addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try {
        const ref = doc(db, "requests", currentPeerRequestDocId);
        await updateDoc(ref, { status: 'rejected' });
        showToast("Solicitação recusada.");
    } catch(e) { console.error(e); }
});

// --- 4. Histórico de Minhas Solicitações ---
function loadMyRequests() {
    const q = query(
        collection(db, "requests"),
        where("requester.uid", "==", currentUserData.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center py-4 text-gray-600 text-xs">Sem histórico.</div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            let statusColor = 'text-yellow-500';
            let statusText = 'Pendente';
            let icon = 'fa-clock';

            if(req.status === 'pending_peer') { statusText = 'Aguardando Colega'; statusColor = 'text-orange-400'; }
            else if(req.status === 'pending_leader') { statusText = 'Em Análise (Líder)'; statusColor = 'text-blue-400'; }
            else if(req.status === 'approved') { statusText = 'Aprovado'; statusColor = 'text-green-400'; icon='fa-check-circle'; }
            else if(req.status === 'rejected') { statusText = 'Recusado'; statusColor = 'text-red-400'; icon='fa-times-circle'; }

            const typeLabel = req.type === 'shift_change' ? 'Troca de Turno' : `Troca com ${req.target.name}`;

            list.innerHTML += `
                <div class="bg-[#161828] p-3 rounded-xl border border-[#2E3250] flex justify-between items-center">
                    <div>
                        <p class="text-xs font-bold text-gray-300">${typeLabel}</p>
                        <p class="text-[10px] text-gray-500">${new Date(req.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div class="flex items-center gap-2 ${statusColor}">
                        <span class="text-[10px] font-bold uppercase tracking-wider">${statusText}</span>
                        <i class="fas ${icon}"></i>
                    </div>
                </div>
            `;
        });
    });
}

// Helpers
async function populatePeerSelect() {
    // Para MVP, pegamos nomes da escala atual. 
    // Em produção, ler de collection('users')
    const sel = document.getElementById('peerSelect');
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const docSnap = await getDoc(doc(db, "escalas", docId));
    if(docSnap.exists()) {
        const names = Object.keys(docSnap.data()).sort();
        names.forEach(n => {
            if(n !== currentUserData.name) {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                sel.appendChild(opt);
            }
        });
    }
}

function formatDate(dateStr) {
    if(!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 4000);
}
