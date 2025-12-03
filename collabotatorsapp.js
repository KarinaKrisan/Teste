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
let selectedDate = new Date(); // Controla o mês visualizado

// ==================================================
// 1. LOGOUT (Esperar DOM estar pronto)
// ==================================================
window.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (e) { alert("Erro ao sair. Tente novamente."); }
        });
    }
    
    // Listener para troca de mês
    const monthSelector = document.getElementById('monthSelector');
    if(monthSelector) {
        monthSelector.addEventListener('change', (e) => {
            const [y, m] = e.target.value.split('-');
            selectedDate = new Date(parseInt(y), parseInt(m), 1);
            initCalendar(); // Recarrega escala com novo mês
        });
    }
});

// ==================================================
// 2. AUTH E IDENTIFICAÇÃO
// ==================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        let displayName = user.displayName;
        const emailPrefix = user.email.split('@')[0];

        // Se não tem nome no perfil, cria um "bonito" baseado no email
        if (!displayName) {
            displayName = emailPrefix.replace(/\./g, ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase());
        }

        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: displayName,
            rawEmailPrefix: emailPrefix
        };
        
        document.getElementById('userDisplayName').textContent = `Olá, ${currentUserData.name}`;
        
        // Inicializa o seletor com Mês Atual e Próximo Mês
        initMonthSelector();
        
        // Carrega dados
        initCalendar();
        loadMyRequests();
        listenToPeerRequests();
        populatePeerSelect();
    } else {
        window.location.href = 'index.html';
    }
});

function initMonthSelector() {
    const sel = document.getElementById('monthSelector');
    if(!sel) return;
    
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    // Limpa e adiciona opções
    sel.innerHTML = '';
    
    // Opção Mês Atual
    const optCurrent = document.createElement('option');
    optCurrent.value = `${now.getFullYear()}-${now.getMonth()}`;
    optCurrent.textContent = `Atual (${now.getMonth()+1}/${now.getFullYear()})`;
    optCurrent.selected = true;
    
    // Opção Próximo Mês
    const optNext = document.createElement('option');
    optNext.value = `${next.getFullYear()}-${next.getMonth()}`;
    optNext.textContent = `Próximo (${next.getMonth()+1}/${next.getFullYear()})`;
    
    sel.appendChild(optCurrent);
    sel.appendChild(optNext);
}

// Normaliza string para comparação (remove acentos, pontos, espaços e minúsculo)
function normalizeString(str) {
    if(!str) return "";
    return str.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// ==================================================
// 3. CALENDÁRIO E BUSCA DE DADOS
// ==================================================
async function initCalendar() {
    const docId = `escala-${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}`;
    const grid = document.getElementById('myCalendarGrid');
    
    grid.innerHTML = '<div class="col-span-7 text-center py-8 text-gray-500 text-xs animate-pulse">Carregando escala...</div>';

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const allKeys = Object.keys(data);
            
            // LÓGICA DE BUSCA DE NOME (MATCHING)
            let foundKey = null;

            // 1. Tenta Exato
            if (data[currentUserData.name]) foundKey = currentUserData.name;

            // 2. Tenta Normalizado pelo Nome (Karina.Krisan == Karina Krisan)
            if (!foundKey) {
                const myNameNorm = normalizeString(currentUserData.name);
                foundKey = allKeys.find(k => normalizeString(k) === myNameNorm);
            }

            // 3. Tenta Normalizado pelo Email (karina.krisan@... == Karina Krisan)
            if (!foundKey) {
                const myEmailNorm = normalizeString(currentUserData.rawEmailPrefix);
                foundKey = allKeys.find(k => normalizeString(k) === myEmailNorm);
            }

            if (foundKey) {
                // Atualiza nome oficial para garantir que requests funcionem
                if(currentUserData.name !== foundKey) currentUserData.name = foundKey;
                renderCalendar(data[foundKey], selectedDate);
            } else {
                grid.innerHTML = '<div class="col-span-7 text-center py-8 text-red-400 text-xs">Seu nome não foi encontrado nesta escala.<br>Contate o administrador.</div>';
            }
        } else {
            grid.innerHTML = '<div class="col-span-7 text-center py-8 text-gray-500 text-xs">Escala deste mês ainda não publicada.</div>';
        }
    } catch (e) {
        console.error("Erro ao ler escala:", e);
        grid.innerHTML = '<div class="col-span-7 text-center py-8 text-red-500 text-xs">Erro ao conectar com o banco de dados.</div>';
    }
}

function renderCalendar(userScheduleData, dateObj) {
    const grid = document.getElementById('myCalendarGrid');
    grid.innerHTML = '';
    const totalDays = new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
    const firstDayDow = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).getDay();

    // Espaços vazios antes do dia 1
    for(let i=0; i<firstDayDow; i++) grid.innerHTML += `<div class="bg-[#1A1C2E] min-h-[60px] opacity-30"></div>`;

    for(let d=1; d<=totalDays; d++) {
        const isWeekend = new Date(dateObj.getFullYear(), dateObj.getMonth(), d).getDay() % 6 === 0;
        let status = isWeekend ? 'F' : 'T'; 

        // Lógica de leitura de dados (Calculated vs Arrays T/F)
        if (userScheduleData.calculatedSchedule && userScheduleData.calculatedSchedule[d-1]) {
            status = userScheduleData.calculatedSchedule[d-1];
        } else {
            if (userScheduleData.T && Array.isArray(userScheduleData.T) && userScheduleData.T.includes(d)) status = 'T';
            if (userScheduleData.F && Array.isArray(userScheduleData.F) && userScheduleData.F.includes(d)) status = 'F';
            // String "segunda a sexta"
            if (typeof userScheduleData.T === 'string' && /segunda a sexta/i.test(userScheduleData.T) && !isWeekend) status = 'T';
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

// ==================================================
// 4. SOLICITAÇÕES E LISTENERS
// ==================================================
// Troca de Turno
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
        showToast("Solicitação enviada para o líder!");
    } catch (error) { console.error(error); showToast("Erro ao enviar."); }
});

// Troca com Colega
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
        showToast(`Solicitação enviada para ${peerName}.`);
    } catch (error) { console.error(error); showToast("Erro ao enviar."); }
});

// Listener de Solicitações Recebidas
let currentPeerRequestDocId = null;
function listenToPeerRequests() {
    const q = query(collection(db, "requests"), where("target.name", "==", currentUserData.name), where("status", "==", "pending_peer"));
    onSnapshot(q, (snapshot) => {
        const container = document.getElementById('peerRequestsContainer');
        if (!container) return;
        if (!snapshot.empty) {
            const docData = snapshot.docs[0].data();
            currentPeerRequestDocId = snapshot.docs[0].id;
            document.getElementById('peerRequestText').innerHTML = `<strong class="text-white">${docData.requester.name}</strong> quer trocar folga: <span class="text-purple-400">${formatDate(docData.details.requesterDate)}</span> por <span class="text-orange-400">${formatDate(docData.details.targetDate)}</span>.`;
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
        await updateDoc(doc(db, "requests", currentPeerRequestDocId), { status: 'pending_leader', 'target.uid': currentUserData.uid, peerAcceptedAt: new Date().toISOString() });
        showToast("Aceito! Enviado para o líder.");
    } catch(e) { console.error(e); }
});

const btnDeny = document.getElementById('btnDenyPeer');
if(btnDeny) btnDeny.addEventListener('click', async () => {
    if(!currentPeerRequestDocId) return;
    try { await updateDoc(doc(db, "requests", currentPeerRequestDocId), { status: 'rejected' }); showToast("Recusado."); } catch(e) {}
});

function loadMyRequests() {
    const q = query(collection(db, "requests"), where("requester.uid", "==", currentUserData.uid));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        if(!list) return;
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
    if(!sel) return;
    const docId = `escala-${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,'0')}`;
    const docSnap = await getDoc(doc(db, "escalas", docId));
    if(docSnap.exists()) {
        const names = Object.keys(docSnap.data()).sort();
        sel.innerHTML = '<option value="">Selecione...</option>';
        names.forEach(n => {
            if(n !== currentUserData.name) {
                const opt = document.createElement('option'); opt.value = n; opt.textContent = n; sel.appendChild(opt);
            }
        });
    }
}

function formatDate(dateStr) { if(!dateStr) return ''; const [y, m, d] = dateStr.split('-'); return `${d}/${m}`; }
function showToast(msg) { const t = document.getElementById('toast'); if(!t) return; document.getElementById('toastMsg').textContent = msg; t.classList.remove('translate-y-20', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 4000); }
