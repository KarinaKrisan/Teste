import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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
        window.location.href = "index.html"; 
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Fallback: Se não tiver displayName, usa a parte antes do @ do email
        let nameToUse = user.displayName;
        if (!nameToUse) {
            nameToUse = user.email.split('@')[0];
            // Tenta formatar bonito: 'karina.krisan' -> 'Karina Krisan' (Visual apenas)
            nameToUse = nameToUse.replace(/\./g, ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase());
        }

        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: nameToUse
        };
        
        document.getElementById('userDisplayName').textContent = `Olá, ${currentUserData.name}`;
        
        initCalendar();
        loadMyRequests();
        listenToPeerRequests();
        populatePeerSelect();
    } else {
        window.location.href = 'index.html';
    }
});

// --- FUNÇÃO MÁGICA DE NORMALIZAÇÃO ---
// Remove acentos, espaços, pontos e deixa minúsculo para comparar
function normalizeString(str) {
    if(!str) return "";
    return str.toString()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[\.\-\s_]/g, ""); // Remove pontos, traços, espaços
}

// --- 1. Calendário e Escala ---
async function initCalendar() {
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    
    const sel = document.getElementById('monthSelector');
    if(sel) {
        sel.innerHTML = `<option value="${date.getFullYear()}-${date.getMonth()}">Atual (${date.getMonth()+1}/${date.getFullYear()})</option>`;
    }

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // BUSCA INTELIGENTE:
            // 1. Tenta achar exato
            // 2. Se não achar, normaliza tudo e compara
            let scheduleKey = Object.keys(data).find(k => k === currentUserData.name);
            
            if (!scheduleKey) {
                const myNormalized = normalizeString(currentUserData.name); // ex: karina.krisan -> karinakrisan
                // Procura nas chaves do banco (ex: "Karina Krisan" -> karinakrisan)
                scheduleKey = Object.keys(data).find(k => normalizeString(k) === myNormalized);
                
                // Extra: Tenta comparar com o email direto também (ex: email karina.krisan@... vs banco Karina Krisan)
                if (!scheduleKey) {
                    const emailUser = normalizeString(currentUserData.email.split('@')[0]);
                    scheduleKey = Object.keys(data).find(k => normalizeString(k) === emailUser);
                }
            }
            
            if (scheduleKey && data[scheduleKey]) {
                // Se achou pelo "match inteligente", atualizamos o nome visual do usuário para ficar igual à escala
                if(currentUserData.name !== scheduleKey) {
                    currentUserData.name = scheduleKey; 
                    document.getElementById('userDisplayName').textContent = `Olá, ${scheduleKey}`;
                }
                renderCalendar(data[scheduleKey], date);
            } else {
                showToast("Sua escala não foi encontrada. Verifique se seu nome está na planilha.");
                document.getElementById('myCalendarGrid').innerHTML = '<div class="col-span-7 text-center py-10 text-gray-500">Escala não encontrada para este usuário.</div>';
            }
        }
    } catch (e) {
        console.error("Erro escala:", e);
    }
}

function renderCalendar(userScheduleData, dateObj) {
    const grid = document.getElementById('myCalendarGrid');
    grid.innerHTML = '';
    const totalDays = new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
    const firstDayDow = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay();

    for(let i=0; i<firstDayDow; i++) grid.innerHTML += `<div class="bg-[#1A1C2E] min-h-[60px] opacity-30"></div>`;

    for(let d=1; d<=totalDays; d++) {
        const isWeekend = new Date(dateObj.getFullYear(), dateObj.getMonth(), d).getDay() % 6 === 0;
        let status = isWeekend ? 'F' : 'T'; 
        
        // Tenta ler calculatedSchedule (versão processada)
        if (userScheduleData.calculatedSchedule && userScheduleData.calculatedSchedule[d-1]) {
            status = userScheduleData.calculatedSchedule[d-1];
        } 
        // Fallback para leitura bruta (T array ou F array)
        else {
            if (userScheduleData.T && Array.isArray(userScheduleData.T) && userScheduleData.T.includes(d)) status = 'T';
            if (userScheduleData.F && Array.isArray(userScheduleData.F) && userScheduleData.F.includes(d)) status = 'F';
            
            // Tratamento especial para string "segunda a sexta"
            if (typeof userScheduleData.T === 'string' && /segunda a sexta/i.test(userScheduleData.T)) {
                if (!isWeekend) status = 'T';
            }
        }

        const colorMap = {
            'T': 'bg-green-500/20 text-green-400 border-green-500/30',
            'F': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
            'FS': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
            'FD': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
            'FE': 'bg-red-500/20 text-red-400 border-red-500/30',
            'OFF-SHIFT': 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30'
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
const formShift = document.getElementById('formShiftSwap');
if(formShift) formShift.addEventListener('submit', async (e) => {
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
        showToast("Solicitação enviada para aprovação do líder!");
    } catch (error) {
        console.error(error);
        showToast("Erro ao enviar solicitação.");
    }
});

const formPeer = document.getElementById('formPeerSwap');
if(formPeer) formPeer.addEventListener('submit', async (e) => {
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
        showToast(`Solicitação enviada para ${peerName}. Aguardando aceite.`);
    } catch (error) {
        console.error(error);
        showToast("Erro ao enviar.");
    }
});

// --- 3. Listeners ---
let currentPeerRequestDocId = null;

function listenToPeerRequests() {
    // Escuta onde o "target.name" é igual ao meu nome
    const q = query(
        collection(db, "requests"), 
        where("target.name", "==", currentUserData.name), 
        where("status", "==", "pending_peer")
    );

    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('peerRequestsContainer');
        if (!container) return;
        
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

const btnAccept = document.getElementById('btnAcceptPeer');
if(btnAccept) btnAccept.addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try {
        const ref = doc(db, "requests", currentPeerRequestDocId);
        await updateDoc(ref, { 
            status: 'pending_leader',
            'target.uid': currentUserData.uid, 
            peerAcceptedAt: new Date().toISOString()
        });
        showToast("Você aceitou! Agora aguarde a aprovação do líder.");
    } catch(e) { console.error(e); }
});

const btnDeny = document.getElementById('btnDenyPeer');
if(btnDeny) btnDeny.addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try {
        const ref = doc(db, "requests", currentPeerRequestDocId);
        await updateDoc(ref, { status: 'rejected' });
        showToast("Solicitação recusada.");
    } catch(e) { console.error(e); }
});

// --- 4. Histórico ---
function loadMyRequests() {
    const q = query(
        collection(db, "requests"),
        where("requester.uid", "==", currentUserData.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        if(!list) return;
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center py-4 text-gray-600 text-xs">Sem histórico recente.</div>';
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
    const sel = document.getElementById('peerSelect');
    if(!sel) return;
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    const docSnap = await getDoc(doc(db, "escalas", docId));
    if(docSnap.exists()) {
        const names = Object.keys(docSnap.data()).sort();
        sel.innerHTML = '<option value="">Selecione...</option>';
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
    if(!t) return;
    document.getElementById('toastMsg').textContent = msg;
    t.classList.remove('translate-y-20', 'opacity-0');
    setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 4000);
}


