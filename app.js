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
let currentUserDbName = null; // Nome para exibir no crachá caso não tenha escala

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

function findNameInScheduleByEmail(email) {
    if (!email || !scheduleData) return null;
    const prefix = email.split('@')[0];
    const normPrefix = normalizeString(prefix); 
    const scheduleNames = Object.keys(scheduleData);
    const match = scheduleNames.find(name => {
        const normName = normalizeString(name); 
        return normName === normPrefix || normName.includes(normPrefix) || normPrefix.includes(normName);
    });
    if (match) return match;
    return null;
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
        
        // 1. ADMIN CHECK
        let isDatabaseAdmin = false;
        try {
            const q1 = query(collection(db, "administradores"), where("email", "==", userEmail));
            const q2 = query(collection(db, "administradores"), where("Email", "==", userEmail));
            const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
            const docUid = await getDoc(doc(db, "administradores", user.uid));

            if (!s1.empty || !s2.empty || docUid.exists()) {
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

        // 2. COLLAB CHECK
        let isDatabaseCollab = false;
        try {
            const docRef = doc(db, "colaboradores", user.uid);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                isDatabaseCollab = true;
                currentUserDbName = docSnap.data().nome || docSnap.data().Nome;
            } else {
                const q1 = query(collection(db, "colaboradores"), where("email", "==", userEmail));
                const q2 = query(collection(db, "colaboradores"), where("Email", "==", userEmail));
                const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
                if(!s1.empty) {
                    isDatabaseCollab = true;
                    currentUserDbName = s1.docs[0].data().nome || s1.docs[0].data().Nome;
                }
                else if(!s2.empty) {
                    isDatabaseCollab = true;
                    currentUserDbName = s2.docs[0].data().nome || s2.docs[0].data().Nome;
                }
            }
        } catch (e) { console.error("Erro Collab Check:", e); }

        if (isDatabaseCollab) {
            setupCollabMode(null); 
            revealApp();
            renderMonthSelector(); 
            loadDataFromCloud();
            return;
        }

        alert(`ACESSO NEGADO: Usuário não encontrado.`);
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
    if(display) display.textContent = name || "Carregando...";
    
    document.getElementById('collabEditHint')?.classList.remove('hidden');
    document.getElementById('adminEditHint')?.classList.add('hidden');
    document.body.style.paddingBottom = "100px";

    if(dailyTabBtn) dailyTabBtn.classList.add('hidden');

    if (name) {
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

    if(btnConfirmCollab) {
        btnConfirmCollab.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btnConfirmCollab.disabled = true;
    }

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        collabModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        let msg = "Erro no login.";
        if(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') msg = "E-mail ou senha incorretos.";
        alert(msg);
    } finally {
        if(btnConfirmCollab) {
            btnConfirmCollab.innerHTML = 'Entrar';
            btnConfirmCollab.disabled = false;
        }
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
// 6. GESTÃO DE DADOS E MÊS
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
    console.log("Baixando dados:", docId);
    
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            updateDailyView();
            initSelect(); 
            
            // COLABORADOR: Tenta achar e fixar a escala
            if (!isAdmin && auth.currentUser) {
                const foundName = findNameInScheduleByEmail(auth.currentUser.email);
                if (foundName) {
                    currentUserCollab = foundName;
                    setupCollabMode(currentUserCollab);
                } else {
                    // Se não achou na escala, mas está logado (tem nome do banco)
                    if(currentUserDbName) renderBadgeOnly(currentUserDbName);
                }
            } 
            // ADMIN: Garante que a tela comece limpa
            else if (isAdmin) {
                const calContainer = document.getElementById('calendarContainer');
                const infoCard = document.getElementById('personalInfoCard');
                const weekendContainer = document.getElementById('weekendPlantaoContainer');
                
                if(calContainer) calContainer.classList.add('hidden');
                if(infoCard) infoCard.classList.add('hidden');
                if(weekendContainer) weekendContainer.innerHTML = '';
            }
        } else {
            console.log("Sem escala.");
            rawSchedule = {}; 
            scheduleData = {};
            processScheduleData(); 
            updateDailyView();
            initSelect();
            
            // Limpa tela Admin
            if (isAdmin) {
                const calContainer = document.getElementById('calendarContainer');
                if(calContainer) calContainer.innerHTML = '';
            } 
            else if (currentUserDbName) {
                renderBadgeOnly(currentUserDbName);
            }
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
        
        if(selectedRequestType === 'troca_folga' || selectedRequestType === 'troca_dia') {
            document.getElementById('swapFields').classList.remove('hidden');
            document.getElementById('shiftFields').classList.add('hidden');
        } else {
            document.getElementById('swapFields').classList.add('hidden');
            document.getElementById('shiftFields').classList.remove('hidden');
        }
    });
});

if(btnCloseReq) btnCloseReq.onclick = () => requestModal.classList.add('hidden');

if(btnSubmitReq) {
    btnSubmitReq.onclick = async () => {
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
        } 
        else if (selectedRequestType === 'troca_dia') {
            const target = targetPeerSelect.value;
            if(!target) return alert("Selecione um colega.");
            reqData.target = target;
            reqData.status = 'pendente_colega'; 
            reqData.description = `quer trocar o dia trabalhado com você em ${reqData.dayLabel}`;
        }
        else {
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
    };
}

// ==========================================
// 8. NOTIFICAÇÕES
// ==========================================
const drawer = document.getElementById('notificationDrawer');
const list = document.getElementById('notificationList');

document.getElementById('btnAdminRequests')?.addEventListener('click', () => drawer.classList.add('translate-x-0'));
document.getElementById('btnCollabInbox')?.addEventListener('click', () => drawer.classList.add('translate-x-0'));
document.getElementById('btnCloseDrawer')?.addEventListener('click', () => drawer.classList.remove('translate-x-0'));

function startRequestsListener() {
    const q = query(collection(db, "requests"), where("monthYear", "==", `${selectedMonthObj.year}-${selectedMonthObj.month}`));
    
    onSnapshot(q, (snapshot) => {
        if(!list) return;
        list.innerHTML = '';
        
        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const rid = docSnap.id;
            let show = false;
            let canAction = false;
            
            if (isAdmin) {
                if (req.status === 'pendente_lider') { show = true; canAction = true; }
            } else if (currentUserCollab) {
                if (req.status === 'pendente_colega' && req.target && req.target.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true; canAction = true;
                }
                if (req.requester.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true; canAction = false;
                }
            }

            if (show) renderRequestItem(rid, req, canAction);
        });

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
        let btnText = isAdmin ? 'Aprovar' : 'Concordo';
        if (isAdmin) btnText = 'Aprovar';
        
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
    if(!confirm("Rejeitar?")) return;
    await updateDoc(doc(db, "requests", id), { status: 'rejeitado' });
}

window.acceptRequest = async (id, currentStatus, type, requester, newDetail) => {
    if (currentStatus === 'pendente_colega') {
        await updateDoc(doc(db, "requests", id), { status: 'pendente_lider' });
        alert("Concordado! Enviado ao líder.");
    }
    else if (currentStatus === 'pendente_lider' && isAdmin) {
        if(!confirm("Aprovar?")) return;
        
        if (type === 'mudanca_turno') {
            try {
                const q = query(collection(db, "colaboradores"), where("Nome", "==", requester));
                const snap = await getDocs(q);
                if (!snap.empty) {
                    await updateDoc(snap.docs[0].ref, { Turno: newDetail });
                } else {
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
        alert("Aprovado!");
    }
}

function applyScheduleChange(req) {
    const idx = req.dayIndex;
    if (req.type === 'troca_folga' || req.type === 'troca_dia') {
        const statusA = rawSchedule[req.requester].calculatedSchedule[idx];
        const statusB = rawSchedule[req.target].calculatedSchedule[idx];
        
        rawSchedule[req.requester].calculatedSchedule[idx] = statusB;
        rawSchedule[req.target].calculatedSchedule[idx] = statusA;
        
        scheduleData[req.requester].schedule[idx] = statusB;
        scheduleData[req.target].schedule[idx] = statusA;
    }
}

// -----------------------------------------------------
// RENDERIZAÇÃO
// -----------------------------------------------------
function renderBadgeOnly(name) {
    const infoCard = document.getElementById('personalInfoCard');
    if(infoCard) {
        infoCard.classList.remove('hidden');
        const displayName = name || "Colaborador";
        const initials = getInitials(displayName);

        infoCard.innerHTML = `
            <div class="bg-gradient-to-r from-[#1A1C2E] to-[#161828] border border-[#2E3250] rounded-2xl p-6 shadow-xl relative overflow-hidden group mb-6">
                <div class="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                <div class="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div class="w-20 h-20 rounded-full p-1 bg-gradient-to-br from-purple-600 to-orange-500 shadow-lg shrink-0">
                        <div class="w-full h-full rounded-full bg-[#0F1020] flex items-center justify-center text-2xl font-bold text-white tracking-widest">
                            ${initials}
                        </div>
                    </div>
                    <div class="text-center md:text-left flex-1 w-full">
                        <h3 class="text-xl font-bold text-white leading-tight mb-1">${displayName}</h3>
                        <p id="badgeCargo" class="text-xs text-purple-400 font-bold uppercase tracking-widest mb-4 bg-purple-500/10 inline-block px-2 py-1 rounded border border-purple-500/20">Carregando...</p>
                        <div class="grid grid-cols-3 gap-3 w-full">
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 uppercase font-bold text-[9px]">Célula</span><span id="badgeCelula" class="text-white font-semibold text-xs">--</span></div>
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 uppercase font-bold text-[9px]">Turno</span><span id="badgeTurno" class="text-white font-semibold text-xs">--</span></div>
                            <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 uppercase font-bold text-[9px]">Horário</span><span id="badgeHorario" class="text-white font-semibold text-xs">--</span></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="text-center text-gray-500 p-8 border border-dashed border-gray-700 rounded-xl">Escala não encontrada para este mês.</div>
        `;
        fetchCollaboratorDetails();
    }
}

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
        
        if(!isAdmin && auth.currentUser) fetchCollaboratorDetails();
        else fetchCollaboratorDetailsByKey(name);
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

async function fetchCollaboratorDetails() {
    try {
        let data = null;
        if (!isAdmin && auth.currentUser) {
            const userEmail = auth.currentUser.email;
            const q1 = query(collection(db, "colaboradores"), where("email", "==", userEmail));
            const s1 = await getDocs(q1);
            if(!s1.empty) data = s1.docs[0].data();
            if(!data) {
                const q2 = query(collection(db, "colaboradores"), where("Email", "==", userEmail));
                const s2 = await getDocs(q2);
                if(!s2.empty) data = s2.docs[0].data();
            }
        }
        if (data) updateBadgeUI(data);
    } catch (e) { console.error(e); }
}

async function fetchCollaboratorDetailsByKey(nameKey) {
    try {
        const q = query(collection(db, "colaboradores"), where("Nome", "==", nameKey));
        const snap = await getDocs(q);
        if(!snap.empty) updateBadgeUI(snap.docs[0].data());
    } catch(e){}
}

function updateBadgeUI(data) {
    const cargo = data.cargo || data.Cargo || "Colaborador";
    const celula = data['célula'] || data.célula || data.celula || data.Celula || "Geral";
    const turno = data.turno || data.Turno || "--";
    const horario = data.horario || data.Horario || "--:--";

    document.getElementById('badgeCargo').textContent = cargo;
    document.getElementById('badgeCelula').textContent = celula;
    document.getElementById('badgeTurno').textContent = turno;
    document.getElementById('badgeHorario').textContent = horario;
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
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;
    Object.keys(rawSchedule).forEach(name => {
        const scheduleArr = rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [];
        scheduleData[name] = { schedule: scheduleArr, info: rawSchedule[name].info || {} };
    });
}

function updateDailyView() {
    if(document.getElementById('dailyView').classList.contains('hidden')) return;
    let cWorking = 0, cOff = 0, cOffShift = 0, cVacation = 0;
    Object.keys(scheduleData).forEach(name => {
        const status = scheduleData[name].schedule[currentDay - 1];
        if (status === 'T') cWorking++;
        else if (['F', 'FS', 'FD'].includes(status)) cOff++;
        else if (status === 'FE') cVacation++;
        else cOffShift++;
    });
    const elW = document.getElementById('kpiWorking'); if(elW) elW.textContent = cWorking;
    const elO = document.getElementById('kpiOff'); if(elO) elO.textContent = cOff;
    const elS = document.getElementById('kpiOffShift'); if(elS) elS.textContent = cOffShift;
    const elV = document.getElementById('kpiVacation'); if(elV) elV.textContent = cVacation;
    updateChart(cWorking, cOff, cOffShift, cVacation);
}

function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '';

    if (isAdmin) {
        select.disabled = false;
        const defaultOpt = document.createElement('option');
        defaultOpt.value = "";
        defaultOpt.textContent = "Selecione um colaborador";
        defaultOpt.selected = true;
        defaultOpt.disabled = true;
        select.appendChild(defaultOpt);

        Object.keys(scheduleData).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            select.appendChild(opt);
        });
        select.addEventListener('change', (e) => {
            if(e.target.value) {
                renderPersonalCalendar(e.target.value);
                document.getElementById('calendarContainer').classList.remove('hidden');
            }
        });
    }
}

function renderWeekendModules(name) {
    const container = document.getElementById('weekendPlantaoContainer');
    if(!container || !scheduleData[name]) return;
    container.innerHTML = '';

    const schedule = scheduleData[name].schedule;
    let hasWeekend = false;

    schedule.forEach((status, index) => {
        const day = index + 1;
        const date = new Date(selectedMonthObj.year, selectedMonthObj.month, day);
        const dw = date.getDay();
        if ((dw === 0 || dw === 6) && status === 'T') {
            hasWeekend = true;
            const dateStr = `${pad(day)}/${pad(selectedMonthObj.month + 1)}`;
            const dayName = dw === 0 ? 'Domingo' : 'Sábado';
            
            const colleagues = [];
            Object.keys(scheduleData).forEach(peer => {
                if(peer !== name && scheduleData[peer].schedule[index] === 'T') colleagues.push(peer);
            });

            let colHtml = colleagues.length ? `<div class="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2">` : `<div class="mt-4 text-xs text-gray-500">Sozinho</div>`;
            colleagues.forEach(c => {
                colHtml += `<span class="bg-orange-500/20 text-orange-400 px-2 py-1 rounded text-[10px] font-bold border border-orange-500/30">${c}</span>`;
            });
            if(colleagues.length) colHtml += `</div>`;

            const card = document.createElement('div');
            card.className = "bg-[#161828] border border-orange-500/30 p-4 rounded-xl shadow-lg relative overflow-hidden group";
            card.innerHTML = `
                <div class="flex justify-between items-center relative z-10">
                    <div>
                        <p class="text-orange-400 text-[10px] font-bold uppercase">${dayName}</p>
                        <p class="text-white font-mono text-2xl font-bold">${dateStr}</p>
                    </div>
                    <span class="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-lg text-xs font-bold border border-orange-500/30">Escalado</span>
                </div>
                ${colHtml}
            `;
            container.appendChild(card);
        }
    });

    if(!hasWeekend) container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500 border border-dashed border-gray-700 rounded-xl">Folga no FDS</div>`;
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
