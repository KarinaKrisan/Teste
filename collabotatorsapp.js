// collabotatorsapp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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

// --- AUTH GUARD: Colaborador ---
document.getElementById('btnLogout').addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = "index.html"; // Volta para login
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email.split('@')[0]
        };
        document.getElementById('userDisplayName').textContent = `Olá, ${currentUserData.name}`;
        
        initCalendar();
        loadMyRequests();
        listenToPeerRequests();
        populatePeerSelect();
    } else {
        // Se não logado, expulsa
        window.location.href = 'index.html';
    }
});

// --- 1. Calendário e Escala ---
async function initCalendar() {
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const sel = document.getElementById('monthSelector');
    sel.innerHTML = `<option value="${date.getFullYear()}-${date.getMonth()}">Atual (${date.getMonth()+1}/${date.getFullYear()})</option>`;

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // Busca o nome do usuário na escala (Case Insensitive)
            const scheduleKey = Object.keys(data).find(k => k.toLowerCase() === currentUserData.name.toLowerCase()) || currentUserData.name;
            
            if (data[scheduleKey]) {
                renderCalendar(data[scheduleKey], date);
            } else {
                showToast("Sua escala não foi encontrada para este mês.");
            }
        }
    } catch (e) { console.error("Erro escala:", e); }
}

function renderCalendar(userScheduleData, dateObj) {
    const grid = document.getElementById('myCalendarGrid');
    grid.innerHTML = '';
    const totalDays = new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
    const firstDayDow = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay();

    for(let i=0; i<firstDayDow; i++) grid.innerHTML += `<div class="bg-[#1A1C2E] min-h-[60px] opacity-30"></div>`;

    for(let d=1; d<=totalDays; d++) {
        // Lógica simplificada de visualização (DEVE ser melhorada em produção para bater com app.js)
        const isWeekend = new Date(dateObj.getFullYear(), dateObj.getMonth(), d).getDay() % 6 === 0;
        let status = isWeekend ? 'F' : 'T'; 
        if (userScheduleData.calculatedSchedule && userScheduleData.calculatedSchedule[d-1]) {
            status = userScheduleData.calculatedSchedule[d-1];
        } else {
            // Fallback caso não tenha calculatedSchedule salvo
            if (userScheduleData.T && Array.isArray(userScheduleData.T) && userScheduleData.T.includes(d)) status = 'T';
            if (userScheduleData.F && Array.isArray(userScheduleData.F) && userScheduleData.F.includes(d)) status = 'F';
        }

        const colorMap = {
            'T': 'bg-green-500/20 text-green-400 border-green-500/30',
            'F': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
            'FS': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
            'FD': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
            'FE': 'bg-red-500/20 text-red-400 border-red-500/30'
        };
        const colorClass = colorMap[status] || 'bg-gray-500/20 text-gray-400';
        
        grid.innerHTML += `
            <div class="bg-[#161828] min-h-[60px] p-2 border border-[#2E3250] flex flex-col justify-between">
                <span class="text-xs font-mono text-gray-500">${d}</span>
                <span class="text-[10px] font-bold px-1 rounded border ${colorClass} text-center w-full">${status}</span>
            </div>
        `;
    }
}

// --- 2. Solicitações ---
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
            status: 'pending_leader',
            createdAt: new Date().toISOString()
        });
        window.closeModal('shiftSwapModal');
        showToast("Enviado para líder!");
    } catch (error) { console.error(error); showToast("Erro ao enviar."); }
});

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
            target: { name: peerName }, 
            details: { requesterDate: myDate, targetDate: peerDate },
            status: 'pending_peer',
            createdAt: new Date().toISOString()
        });
        window.closeModal('dayOffSwapModal');
        showToast(`Enviado para ${peerName}.`);
    } catch (error) { console.error(error); showToast("Erro ao enviar."); }
});

// --- 3. Listeners ---
let currentPeerRequestDocId = null;
function listenToPeerRequests() {
    const q = query(collection(db, "requests"), where("target.name", "==", currentUserData.name), where("status", "==", "pending_peer"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('peerRequestsContainer');
        if (!snapshot.empty) {
            const docData = snapshot.docs[0].data();
            currentPeerRequestDocId = snapshot.docs[0].id;
            document.getElementById('peerRequestText').innerHTML = 
                `<strong class="text-white">${docData.requester.name}</strong> propôs trocar folga: <span class="text-purple-400">${formatDate(docData.details.requesterDate)}</span> por <span class="text-orange-400">${formatDate(docData.details.targetDate)}</span>.`;
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
            currentPeerRequestDocId = null;
        }
    });
}

document.getElementById('btnAcceptPeer').addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try {
        await updateDoc(doc(db, "requests", currentPeerRequestDocId), { status: 'pending_leader', 'target.uid': currentUserData.uid, peerAcceptedAt: new Date().toISOString() });
        showToast("Aceito! Aguardando líder.");
    } catch(e) { console.error(e); }
});

document.getElementById('btnDenyPeer').addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try { await updateDoc(doc(db, "requests", currentPeerRequestDocId), { status: 'rejected' }); showToast("Recusado."); } catch(e) {}
});

function loadMyRequests() {
    const q = query(collection(db, "requests"), where("requester.uid", "==", currentUserData.uid));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = '<div class="text-center py-4 text-gray-600 text-xs">Sem histórico.</div>'; return; }
        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            let statusText = req.status === 'pending_peer' ? 'Aguardando Colega' : req.status === 'pending_leader' ? 'Em Análise' : req.status === 'approved' ? 'Aprovado' : 'Recusado';
            let color = req.status === 'approved' ? 'text-green-400' : req.status === 'rejected' ? 'text-red-400' : 'text-yellow-500';
            list.innerHTML += `<div class="bg-[#161828] p-3 rounded-xl border border-[#2E3250] flex justify-between items-center mb-2"><div><p class="text-xs font-bold text-gray-300">${req.type==='shift_change'?'Troca de Turno':'Troca com '+req.target.name}</p></div><div class="${color} text-[10px] font-bold uppercase">${statusText}</div></div>`;
        });
    });
}

async function populatePeerSelect() {
    const sel = document.getElementById('peerSelect');
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const docSnap = await getDoc(doc(db, "escalas", docId));
    if(docSnap.exists()) {
        Object.keys(docSnap.data()).sort().forEach(n => {
            if(n !== currentUserData.name) {
                const opt = document.createElement('option'); opt.value = n; opt.textContent = n; sel.appendChild(opt);
            }
        });
    }
}

function formatDate(dateStr) { if(!dateStr) return ''; const [y, m, d] = dateStr.split('-'); return `${d}/${m}`; }
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toastMsg').textContent = msg; t.classList.remove('translate-y-20', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 4000); }


