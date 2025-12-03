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

// ==================================================
// 1. LÓGICA DE LOGOUT (Corrigida)
// ==================================================
// Espera o site carregar completamente antes de adicionar a função ao botão
window.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            try {
                await signOut(auth);
                window.location.href = "index.html";
            } catch (error) {
                console.error("Erro ao sair:", error);
                alert("Erro ao tentar sair. Tente recarregar a página.");
            }
        });
    }
});

// ==================================================
// 2. AUTH GUARD & IDENTIFICAÇÃO
// ==================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Tenta pegar o nome do perfil. Se não tiver, gera a partir do email.
        let rawName = user.displayName;
        if (!rawName) {
            // Ex: "karina.krisan@..." vira "Karina Krisan" visualmente
            const emailPrefix = user.email.split('@')[0];
            rawName = emailPrefix.replace(/\./g, ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase());
        }

        currentUserData = {
            uid: user.uid,
            email: user.email,
            name: rawName,
            emailPrefix: user.email.split('@')[0] // Guarda o prefixo original (karina.krisan)
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

// ==================================================
// 3. FUNÇÃO DE BUSCA PROFUNDA (Normalização)
// ==================================================
function normalizeString(str) {
    if(!str) return "";
    return str.toString()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^a-z0-9]/g, ""); // Remove TUDO que não for letra ou número (espaços, pontos, traços)
}

// ==================================================
// 4. CALENDÁRIO E ESCALA
// ==================================================
async function initCalendar() {
    const date = new Date();
    // Ajuste para o seu documento padrão. Se sua escala no banco for de outro mês, ajuste aqui ou na planilha.
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    
    const sel = document.getElementById('monthSelector');
    if(sel) sel.innerHTML = `<option value="${date.getFullYear()}-${date.getMonth()}">Atual (${date.getMonth()+1}/${date.getFullYear()})</option>`;

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            const allKeys = Object.keys(data);
            
            // TENTATIVAS DE ENCONTRAR O USUÁRIO NA LISTA
            
            // 1. Busca Exata
            let foundKey = allKeys.find(k => k === currentUserData.name);
            
            // 2. Busca Normalizada pelo Nome (Ignora pontos e espaços)
            if (!foundKey) {
                const myNameNorm = normalizeString(currentUserData.name); // Ex: karinakrisan
                foundKey = allKeys.find(k => normalizeString(k) === myNameNorm);
            }

            // 3. Busca Normalizada pelo Email (Fallback agressivo)
            // Ex: karina.krisan@... tenta achar "Karina Krisan"
            if (!foundKey) {
                const myEmailNorm = normalizeString(currentUserData.emailPrefix); // Ex: karinakrisan
                foundKey = allKeys.find(k => normalizeString(k) === myEmailNorm);
            }

            if (foundKey) {
                // Sucesso!
                console.log(`Usuário encontrado! Conectado como: ${currentUserData.email} -> Chave na Escala: ${foundKey}`);
                if(currentUserData.name !== foundKey) {
                    document.getElementById('userDisplayName').textContent = `Olá, ${foundKey}`; // Atualiza interface com nome oficial
                    currentUserData.name = foundKey; // Atualiza dado interno para requests funcionarem
                }
                renderCalendar(data[foundKey], date);
            } else {
                // Falha
                console.warn("Nomes disponíveis no banco:", allKeys);
                showToast(`Escala não encontrada. Buscamos por: "${currentUserData.name}" ou "${currentUserData.emailPrefix}".`);
                document.getElementById('myCalendarGrid').innerHTML = '<div class="col-span-7 text-center py-10 text-gray-500 text-xs">Escala não encontrada.<br>Verifique se o nome no banco de dados corresponde ao seu e-mail.</div>';
            }
        } else {
            showToast("Nenhuma escala publicada para este mês.");
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
        
        if (userScheduleData.calculatedSchedule && userScheduleData.calculatedSchedule[d-1]) {
            status = userScheduleData.calculatedSchedule[d-1];
        } else {
            if (userScheduleData.T && Array.isArray(userScheduleData.T) && userScheduleData.T.includes(d)) status = 'T';
            if (userScheduleData.F && Array.isArray(userScheduleData.F) && userScheduleData.F.includes(d)) status = 'F';
            
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

// ==================================================
// 5. SOLICITAÇÕES
// ==================================================
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
    } catch (error) { console.error(error); showToast("Erro ao enviar solicitação."); }
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
    } catch (error) { console.error(error); showToast("Erro ao enviar."); }
});

// ==================================================
// 6. LISTENERS E HELPERS
// ==================================================
let currentPeerRequestDocId = null;

function listenToPeerRequests() {
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
        await updateDoc(doc(db, "requests", currentPeerRequestDocId), { 
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
        await updateDoc(doc(db, "requests", currentPeerRequestDocId), { status: 'rejected' });
        showToast("Solicitação recusada.");
    } catch(e) { console.error(e); }
});

function loadMyRequests() {
    const q = query(collection(db, "requests"), where("requester.uid", "==", currentUserData.uid));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        if(!list) return;
        list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = '<div class="text-center py-4 text-gray-600 text-xs">Sem histórico recente.</div>'; return; }
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
    const date = new Date();
    const docId = `escala-${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
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


