// app.js - Cronos Workforce Management
// ==========================================
// 1. IMPORTAÇÕES FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// ==========================================
// 2. CONFIGURAÇÃO
// ==========================================
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

// ==========================================
// 3. ESTADO GLOBAL
// ==========================================
let isAdmin = false;
let currentUserCollab = null; 
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let currentDay = new Date().getDate();

// Data System
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const availableMonths = [
    { label: "Novembro 2025", year: 2025, month: 10 },
    { label: "Dezembro 2025", year: 2025, month: 11 }, 
    { label: "Janeiro 2026", year: 2026, month: 0 }, 
    { label: "Fevereiro 2026", year: 2026, month: 1 }, 
    { label: "Março 2026", year: 2026, month: 2 }
];

let selectedMonthObj = availableMonths.find(m => m.year === currentDateObj.getFullYear() && m.month === currentDateObj.getMonth()) || availableMonths[1];

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. GESTÃO DE ACESSO & UTILS
// ==========================================

function normalizeString(str) {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getInitials(name) {
    if (!name) return "CR";
    const parts = name.split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function resolveCollaboratorName(email) {
    if(!email) return "Colaborador";
    const prefix = email.split('@')[0];
    const normalizedPrefix = normalizeString(prefix);

    if (Object.keys(scheduleData).length > 0) {
        const matchKey = Object.keys(scheduleData).find(dbKey => {
            const normalizedDbKey = normalizeString(dbKey);
            return normalizedDbKey === normalizedPrefix || normalizedDbKey.includes(normalizedPrefix);
        });
        if (matchKey) return matchKey;
    }
    return prefix.replace(/\./g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const landingPage = document.getElementById('landingPage');
const appInterface = document.getElementById('appInterface');

function revealApp() {
    if(landingPage) landingPage.classList.add('hidden');
    if(appInterface) {
        appInterface.classList.remove('hidden');
        setTimeout(() => appInterface.classList.remove('opacity-0'), 50);
    }
}

function hideApp() {
    if(appInterface) {
        appInterface.classList.add('opacity-0');
        setTimeout(() => {
            appInterface.classList.add('hidden');
            if(landingPage) landingPage.classList.remove('hidden');
        }, 500);
    }
}

// === AUTH LISTENER ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userEmail = user.email.trim();
        console.log(`[AUTH] Verificando: ${userEmail} (UID: ${user.uid})`);

        // 1. ADMIN
        let isDatabaseAdmin = false;
        try {
            const adminDoc = await getDoc(doc(db, "administradores", user.uid));
            const qAdminLower = query(collection(db, "administradores"), where("email", "==", userEmail));
            const qAdminUpper = query(collection(db, "administradores"), where("Email", "==", userEmail));
            const [snapLower, snapUpper] = await Promise.all([getDocs(qAdminLower), getDocs(qAdminUpper)]);

            if (adminDoc.exists() || !snapLower.empty || !snapUpper.empty) {
                isDatabaseAdmin = true;
            }
        } catch (e) { console.error("Erro Admin Check:", e); }

        if (isDatabaseAdmin) {
            setAdminMode(true);
            revealApp();
            renderMonthSelector(); 
            loadDataFromCloud();
            return;
        }

        // 2. COLABORADOR
        let isDatabaseCollab = false;
        let dbName = null;
        try {
            const collabDoc = await getDoc(doc(db, "colaboradores", user.uid));
            const qCollabLower = query(collection(db, "colaboradores"), where("email", "==", userEmail));
            const qCollabUpper = query(collection(db, "colaboradores"), where("Email", "==", userEmail));
            const [snapCLower, snapCUpper] = await Promise.all([getDocs(qCollabLower), getDocs(qCollabUpper)]);

            if (collabDoc.exists()) {
                const data = collabDoc.data();
                isDatabaseCollab = true;
                dbName = data.nome || data.Nome || data.name;
            } else if (!snapCLower.empty) {
                const data = snapCLower.docs[0].data();
                isDatabaseCollab = true;
                dbName = data.nome || data.Nome || data.name;
            } else if (!snapCUpper.empty) {
                const data = snapCUpper.docs[0].data();
                isDatabaseCollab = true;
                dbName = data.nome || data.Nome || data.name;
            }
        } catch (e) { console.error("Erro Collab Check:", e); }

        if (isDatabaseCollab) {
            const finalName = dbName || resolveCollaboratorName(user.email);
            currentUserCollab = finalName;
            setupCollabMode(currentUserCollab);
            revealApp();
            renderMonthSelector(); 
            loadDataFromCloud();
            return;
        }

        alert(`ERRO DE LOGIN: Usuário não encontrado no banco de dados.`);
        signOut(auth);
        hideApp();

    } else {
        hideApp();
    }
});

function setAdminMode(active) {
    isAdmin = active;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); 
    
    if(active) {
        if(adminToolbar) adminToolbar.classList.remove('hidden');
        if(collabToolbar) collabToolbar.classList.add('hidden'); 
        document.getElementById('adminEditHint')?.classList.remove('hidden');
        document.getElementById('collabEditHint')?.classList.add('hidden');
        document.body.style.paddingBottom = "100px";
        if(dailyTabBtn) dailyTabBtn.classList.remove('hidden');
        startRequestsListener();
    } else {
        if(adminToolbar) adminToolbar.classList.add('hidden');
        document.getElementById('adminEditHint')?.classList.add('hidden');
    }
}

function setupCollabMode(name) {
    isAdmin = false;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); 
    
    if(adminToolbar) adminToolbar.classList.add('hidden');
    if(collabToolbar) collabToolbar.classList.remove('hidden');
    
    const display = document.getElementById('collabNameDisplay');
    if(display) display.textContent = name;
    
    document.getElementById('collabEditHint')?.classList.remove('hidden');
    document.getElementById('adminEditHint')?.classList.add('hidden');
    document.body.style.paddingBottom = "100px";

    if(dailyTabBtn) dailyTabBtn.classList.add('hidden');

    const empSelect = document.getElementById('employeeSelect');
    if(empSelect) {
        empSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        empSelect.appendChild(opt);
        empSelect.value = name;
        empSelect.disabled = true; 
        
        if (scheduleData && scheduleData[name]) {
            renderPersonalCalendar(name);
        }
    }

    const personalTab = document.querySelector('[data-tab="personal"]');
    if(personalTab) personalTab.click();
    
    startRequestsListener();
}

const btnLogout = document.getElementById('btnLogout');
if(btnLogout) btnLogout.addEventListener('click', () => signOut(auth));

// ==========================================
// 5. LOGIN
// ==========================================
const collabModal = document.getElementById('collabLoginModal');
const btnLandingCollab = document.getElementById('btnLandingCollab');
const btnCancelCollab = document.getElementById('btnCancelCollabLogin');
const btnConfirmCollab = document.getElementById('btnConfirmCollabLogin');
const emailInput = document.getElementById('collabEmailInput');
const passInput = document.getElementById('collabPassInput');

if(btnLandingCollab) {
    btnLandingCollab.addEventListener('click', () => {
        if(emailInput) emailInput.value = '';
        if(passInput) passInput.value = '';
        collabModal.classList.remove('hidden');
        setTimeout(() => { if(emailInput) emailInput.focus(); }, 100);
    });
}

if(btnCancelCollab) btnCancelCollab.addEventListener('click', () => collabModal.classList.add('hidden'));

const performLogin = async () => {
    const email = emailInput.value.trim();
    const pass = passInput.value;
    const btn = btnConfirmCollab;

    if(!email || !pass) return alert("Preencha todos os campos.");

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await signInWithEmailAndPassword(auth, email, pass);
        collabModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        let msg = "Erro no login.";
        if(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') msg = "E-mail ou senha incorretos.";
        alert(msg);
    } finally {
        btn.innerHTML = 'Entrar';
    }
};

if(btnConfirmCollab) btnConfirmCollab.addEventListener('click', performLogin);

if(emailInput) {
    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); passInput.focus(); }
    });
}
if(passInput) {
    passInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); performLogin(); }
    });
}

document.getElementById('btnCollabLogout')?.addEventListener('click', () => signOut(auth));


// ==========================================
// 6. GESTÃO DE DADOS
// ==========================================

function renderMonthSelector() {
    const container = document.getElementById('monthSelectorContainer');
    if(!container) return;
    if(container.innerHTML !== '') return;

    const select = document.createElement('select');
    select.className = "bg-[#1A1C2E] border border-cronos-border text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full p-2.5 shadow-lg font-bold";
    
    availableMonths.forEach((m, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = m.label;
        if (m.year === selectedMonthObj.year && m.month === selectedMonthObj.month) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    select.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        selectedMonthObj = availableMonths[index];
        rawSchedule = {};
        scheduleData = {};
        loadDataFromCloud();
    });

    container.appendChild(select);
}

async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando escala:", docId);
    
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            updateDailyView();
            initSelect(); 
            
            if (!isAdmin && currentUserCollab) {
                const betterName = resolveCollaboratorName(auth.currentUser.email);
                if(betterName) currentUserCollab = betterName;
                setupCollabMode(currentUserCollab);
            }
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            scheduleData = {};
            processScheduleData(); 
            updateDailyView();
            initSelect();
            if (!isAdmin && currentUserCollab) setupCollabMode(currentUserCollab);
        }
    } catch (e) {
        console.error("Erro ao baixar dados:", e);
    }
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        if(status) {
            status.textContent = "Salvo!";
            statusIcon.className = "w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]";
        }
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
            if(status) {
                status.textContent = "Sincronizado";
                statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500";
            }
        }, 2000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        btn.innerHTML = 'Erro';
    }
}
document.getElementById('btnSaveCloud')?.addEventListener('click', saveToCloud);

// ==========================================
// 7. LÓGICA DE SOLICITAÇÕES
// ==========================================
const requestModal = document.getElementById('requestModal');
const btnCloseReq = document.getElementById('btnCloseRequestModal');
const btnSubmitReq = document.getElementById('btnSubmitRequest');
const targetPeerSelect = document.getElementById('targetPeerSelect');
let selectedRequestDate = null;
let selectedRequestType = 'troca_folga'; 

window.openRequestModal = function(dayIndex) {
    if(!currentUserCollab) return;
    selectedRequestDate = dayIndex;
    
    const dateStr = `${pad(dayIndex+1)}/${pad(selectedMonthObj.month+1)}`;
    document.getElementById('requestDateLabel').textContent = `Para o dia ${dateStr}`;
    document.getElementById('newShiftInput').value = '';
    
    if(targetPeerSelect) {
        targetPeerSelect.innerHTML = '<option value="">Selecione um colega...</option>';
        Object.keys(scheduleData).sort().forEach(name => {
            if(!name.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                targetPeerSelect.appendChild(opt);
            }
        });
    }
    requestModal.classList.remove('hidden');
}

document.querySelectorAll('.req-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.req-type-btn').forEach(b => b.classList.remove('active', 'bg-purple-500/20', 'border-purple-500', 'text-white'));
        document.querySelectorAll('.req-type-btn').forEach(b => b.classList.add('bg-[#0F1020]', 'text-gray-400', 'border-[#2E3250]'));
        
        btn.classList.remove('bg-[#0F1020]', 'text-gray-400', 'border-[#2E3250]');
        btn.classList.add('active', 'bg-purple-500/20', 'border-purple-500', 'text-white');
        
        selectedRequestType = btn.dataset.type;
        
        if(selectedRequestType === 'troca_folga') {
            document.getElementById('swapFields').classList.remove('hidden');
            document.getElementById('shiftFields').classList.add('hidden');
        } else {
            document.getElementById('swapFields').classList.add('hidden');
            document.getElementById('shiftFields').classList.remove('hidden');
        }
    });
});

if(btnCloseReq) btnCloseReq.addEventListener('click', () => requestModal.classList.add('hidden'));

if(btnSubmitReq) {
    btnSubmitReq.addEventListener('click', async () => {
        if(selectedRequestDate === null) return;
        
        const reqData = {
            requester: currentUserCollab,
            dayIndex: selectedRequestDate,
            dayLabel: `${pad(selectedRequestDate+1)}/${pad(selectedMonthObj.month+1)}`,
            monthYear: `${selectedMonthObj.year}-${selectedMonthObj.month}`,
            type: selectedRequestType,
            createdAt: new Date().toISOString(),
            status: 'pendente' 
        };

        if (selectedRequestType === 'troca_folga') {
            const target = targetPeerSelect.value;
            if(!target) return alert("Selecione um colega.");
            reqData.target = target;
            reqData.status = 'pendente_colega'; 
            reqData.description = `quer trocar folga com você no dia ${reqData.dayLabel}`;
        } else {
            const newShift = document.getElementById('newShiftInput').value;
            if(!newShift) return alert("Digite o turno desejado.");
            reqData.newDetail = newShift;
            reqData.status = 'pendente_lider'; 
            reqData.description = `solicita mudança de turno para: ${newShift}`;
        }

        try {
            btnSubmitReq.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            await addDoc(collection(db, "requests"), reqData);
            requestModal.classList.add('hidden');
            alert("Solicitação enviada com sucesso!");
        } catch (e) {
            console.error(e);
            alert("Erro ao enviar.");
        } finally {
            btnSubmitReq.innerHTML = 'Enviar Solicitação';
        }
    });
}

// ==========================================
// 8. NOTIFICAÇÕES (COM AUTOMAÇÃO)
// ==========================================
const drawer = document.getElementById('notificationDrawer');
const list = document.getElementById('notificationList');
const badges = { admin: document.getElementById('adminBadge'), collab: document.getElementById('collabBadge') };

document.getElementById('btnAdminRequests')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCollabInbox')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCloseDrawer')?.addEventListener('click', () => drawer.classList.remove('translate-x-0'));

function openDrawer() {
    if(drawer) drawer.classList.add('translate-x-0');
}

function startRequestsListener() {
    const q = query(collection(db, "requests"), where("monthYear", "==", `${selectedMonthObj.year}-${selectedMonthObj.month}`));
    
    onSnapshot(q, (snapshot) => {
        if(!list) return;
        list.innerHTML = '';
        let count = 0;
        
        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const rid = docSnap.id;
            let show = false;
            let canAction = false;
            
            if (isAdmin) {
                if (req.status === 'pendente_lider') { show = true; canAction = true; count++; }
            } else if (currentUserCollab) {
                if (req.status === 'pendente_colega' && req.target && req.target.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true; canAction = true; count++;
                }
                if (req.requester.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true; canAction = false;
                }
            }

            if (show) renderRequestItem(rid, req, canAction);
        });

        if(isAdmin && badges.admin) {
            badges.admin.textContent = count;
            badges.admin.classList.toggle('hidden', count === 0);
        } else if (badges.collab) {
            badges.collab.textContent = count;
            badges.collab.classList.toggle('hidden', count === 0);
        }

        if(list.children.length === 0) {
            list.innerHTML = `<div class="text-center mt-10 text-gray-500"><i class="fas fa-check-circle text-4xl mb-3 opacity-20"></i><p class="text-sm">Nada pendente.</p></div>`;
        }
    });
}

function renderRequestItem(id, req, canAction) {
    let statusColor = 'gray';
    let statusText = 'Pendente';
    
    if (req.status === 'pendente_colega') { statusColor = 'orange'; statusText = `Aguardando ${req.target}`; }
    else if (req.status === 'pendente_lider') { statusColor = 'purple'; statusText = 'Aprovação do Líder'; }
    else if (req.status === 'aprovado') { statusColor = 'green'; statusText = 'Aprovado'; }
    else if (req.status === 'rejeitado') { statusColor = 'red'; statusText = 'Rejeitado'; }

    const item = document.createElement('div');
    item.className = "bg-[#0F1020] p-4 rounded-xl border border-[#2E3250] shadow-sm relative overflow-hidden";
    
    let actionButtons = '';
    if (canAction) {
        let btnText = isAdmin ? 'Aprovar Troca' : 'Concordo';
        if (req.type === 'mudanca_turno' && isAdmin) btnText = 'Aprovar Mudança';
        
        actionButtons = `
            <div class="flex gap-2 mt-3">
                <button onclick="window.rejectRequest('${id}')" class="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 py-2 rounded text-xs font-bold border border-red-500/30">Recusar</button>
                <button onclick="window.acceptRequest('${id}', '${req.status}', '${req.type}', '${req.requester}', '${req.newDetail}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold shadow-lg">${btnText}</button>
            </div>
        `;
    }

    item.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-bold text-${statusColor}-400 border border-${statusColor}-500/30 bg-${statusColor}-500/10 px-2 py-0.5 rounded uppercase">${statusText}</span>
            <span class="text-[10px] text-gray-500 font-mono">${req.dayLabel}</span>
        </div>
        <p class="text-sm text-gray-300">
            <strong class="text-white">${req.requester}</strong> ${req.description}
        </p>
        ${actionButtons}
    `;
    
    list.appendChild(item);
}

window.rejectRequest = async (id) => {
    if(!confirm("Rejeitar solicitação?")) return;
    await updateDoc(doc(db, "requests", id), { status: 'rejeitado' });
}

window.acceptRequest = async (id, currentStatus, type, requester, newDetail) => {
    if (currentStatus === 'pendente_colega') {
        await updateDoc(doc(db, "requests", id), { status: 'pendente_lider' });
        alert("Você concordou! Enviado para o líder.");
    }
    else if (currentStatus === 'pendente_lider' && isAdmin) {
        if(!confirm("Aprovar solicitação?")) return;
        
        if (type === 'mudanca_turno') {
            try {
                // Tenta achar com Nome maiúsculo
                const q = query(collection(db, "colaboradores"), where("Nome", "==", requester));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    await updateDoc(snap.docs[0].ref, { Turno: newDetail });
                } else {
                    // Tenta achar com nome minúsculo
                    const q2 = query(collection(db, "colaboradores"), where("nome", "==", requester));
                    const snap2 = await getDocs(q2);
                    if(!snap2.empty) await updateDoc(snap2.docs[0].ref, { turno: newDetail });
                }
            } catch(e) { console.error(e); }
        } else {
            const reqSnap = await getDoc(doc(db, "requests", id));
            applyScheduleChange(reqSnap.data());
            await saveToCloud();
        }

        await updateDoc(doc(db, "requests", id), { status: 'aprovado' });
        alert("Solicitação aprovada e aplicada!");
    }
}

function applyScheduleChange(req) {
    const idx = req.dayIndex;
    if (req.type === 'troca_folga') {
        const statusA = rawSchedule[req.requester].calculatedSchedule[idx];
        const statusB = rawSchedule[req.target].calculatedSchedule[idx];
        
        rawSchedule[req.requester].calculatedSchedule[idx] = statusB;
        rawSchedule[req.target].calculatedSchedule[idx] = statusA;
        
        scheduleData[req.requester].schedule[idx] = statusB;
        scheduleData[req.target].schedule[idx] = statusA;
    }
}

function toggleDayStatus(name, index) {
    const currentStatus = scheduleData[name].schedule[index];
    let nextStatus = 'T';
    
    if (currentStatus === 'T') nextStatus = 'F';
    else if (currentStatus === 'F') nextStatus = 'FE';
    else if (currentStatus === 'FE') nextStatus = 'T';
    else nextStatus = 'T'; 

    scheduleData[name].schedule[index] = nextStatus;
    if (rawSchedule[name].calculatedSchedule) {
        rawSchedule[name].calculatedSchedule[index] = nextStatus;
    } else if (rawSchedule[name].schedule) {
        rawSchedule[name].schedule[index] = nextStatus;
    }

    renderPersonalCalendar(name);
    
    const statusEl = document.getElementById('saveStatus');
    const iconEl = document.getElementById('saveStatusIcon');
    if(statusEl) {
        statusEl.textContent = "Alterações pendentes";
        statusEl.className = "text-xs text-yellow-400 font-bold animate-pulse";
        iconEl.className = "w-1.5 h-1.5 rounded-full bg-yellow-500";
    }
}

// -----------------------------------------------------
// ATUALIZAÇÃO: HEADER CRACHÁ (LEITURA DINÂMICA)
// -----------------------------------------------------
function renderPersonalCalendar(name) {
    const container = document.getElementById('calendarContainer');
    const grid = document.getElementById('calendarGrid');
    const infoCard = document.getElementById('personalInfoCard');
    
    if(!container || !grid) return;
    
    container.classList.remove('hidden');
    grid.innerHTML = '';
    
    if(!scheduleData[name]) return;
    const schedule = scheduleData[name].schedule;
    const initials = getInitials(name);

    if(infoCard) {
        infoCard.classList.remove('hidden');
        infoCard.innerHTML = `
            <div class="bg-gradient-to-r from-[#1A1C2E] to-[#161828] border border-[#2E3250] rounded-2xl p-6 shadow-xl relative overflow-hidden group mb-6">
                <div class="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all group-hover:bg-purple-500/20"></div>

                <div class="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div class="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-purple-600 to-orange-500 shadow-lg shrink-0">
                        <div class="w-full h-full rounded-full bg-[#0F1020] flex items-center justify-center text-2xl font-bold text-white tracking-widest">
                            ${initials}
                        </div>
                    </div>

                    <div class="text-center md:text-left flex-1 w-full">
                        <h3 class="text-xl font-bold text-white leading-tight mb-1">${name}</h3>
                        <p id="badgeCargo" class="text-xs text-purple-400 font-bold uppercase tracking-widest mb-4 bg-purple-500/10 inline-block px-2 py-1 rounded border border-purple-500/20">--</p>

                        <div class="grid grid-cols-3 gap-3 w-full">
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start">
                                <span class="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-0.5">Célula</span>
                                <span id="badgeCelula" class="text-white font-semibold text-xs">--</span>
                            </div>
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start">
                                <span class="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-0.5">Turno</span>
                                <span id="badgeTurno" class="text-white font-semibold text-xs">--</span>
                            </div>
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start">
                                <span class="text-gray-500 uppercase font-bold text-[9px] tracking-wider mb-0.5">Horário</span>
                                <span id="badgeHorario" class="text-white font-semibold text-xs">--:--</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="flex items-center gap-2 mb-3 px-1">
                <i class="fas fa-calendar-alt text-gray-500"></i>
                <span class="text-sm text-gray-400 font-medium capitalize">${selectedMonthObj.label}</span>
            </div>
        `;
        
        fetchCollaboratorDetails(name);
    }
    
    const firstDayOfWeek = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();

    for (let i = 0; i < firstDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = "calendar-cell bg-transparent border-none pointer-events-none"; 
        grid.appendChild(emptyCell);
    }

    for (let i = 0; i < schedule.length; i++) {
        const status = schedule[i] || '-';
        const dayNum = i + 1;
        
        const cell = document.createElement('div');
        cell.className = "calendar-cell border-b border-r border-[#2E3250] relative group cursor-pointer";
        
        let badgeClass = "day-status-badge ";
        if(status === 'T') badgeClass += "status-T";
        else if(['F', 'FS', 'FD'].includes(status)) badgeClass += "status-F";
        else if(status === 'FE') badgeClass += "status-FE";
        else badgeClass += "status-OFF-SHIFT";

        cell.innerHTML = `<div class="day-number">${dayNum}</div><div class="${badgeClass}">${status}</div>`;
        cell.addEventListener('click', () => {
            if(isAdmin) toggleDayStatus(name, i);
            else if(currentUserCollab === name) openRequestModal(i);
        });

        grid.appendChild(cell);
    }

    renderWeekendModules(name);
}

// --- BUSCA DADOS FLEXÍVEL (Com Acento e Sem Acento) ---
async function fetchCollaboratorDetails(name) {
    try {
        const q = query(collection(db, "colaboradores"), where("Nome", "==", name));
        const querySnapshot = await getDocs(q);
        
        let data = {};
        if (!querySnapshot.empty) {
            data = querySnapshot.docs[0].data();
        } else {
            const q2 = query(collection(db, "colaboradores"), where("nome", "==", name));
            const snap2 = await getDocs(q2);
            if(!snap2.empty) data = snap2.docs[0].data();
        }

        if (data) {
            // Tenta todas as variações de escrita do banco (com e sem acento)
            const cargo = data.Cargo || data.cargo || "Colaborador";
            // Tenta 'Célula' (com acento), 'célula', 'Celula', 'celula'
            const celula = data.Célula || data.célula || data.Celula || data.celula || "Geral";
            const turno = data.Turno || data.turno || "--";
            // Tenta 'Horário' (com acento), 'horário', 'Horario', 'horario'
            const horario = data.Horário || data.horário || data.Horario || data.horario || "--:--";

            document.getElementById('badgeCargo').textContent = cargo;
            document.getElementById('badgeCelula').textContent = celula;
            document.getElementById('badgeTurno').textContent = turno;
            document.getElementById('badgeHorario').textContent = horario;
        }
    } catch (e) {
        console.error("Erro ao buscar detalhes do colaborador:", e);
    }
}

function updateChart(working, off, offShift, vacation) {
    const ctx = document.getElementById('dailyChart');
    if (!ctx) return;

    if (dailyChart) {
        dailyChart.data.datasets[0].data = [working, off, vacation, offShift];
        dailyChart.update();
        return;
    }

    // @ts-ignore
    dailyChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Trab.', 'Folga', 'Férias', 'Encerr.'],
            datasets: [{
                data: [working, off, vacation, offShift],
                backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#d946ef'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function initGlobal() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
        });
    });

    const ds = document.getElementById('dateSlider');
    if (ds) {
        ds.max = 31; 
        ds.addEventListener('input', e => { 
            currentDay = parseInt(e.target.value); 
            updateDailyView(); 
        });
    }
    
    loadDataFromCloud();
}

document.addEventListener('DOMContentLoaded', initGlobal);
