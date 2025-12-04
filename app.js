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
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 

const availableMonths = [
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }
];
// Seleciona o mês atual ou o primeiro da lista
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. GESTÃO DE ACESSO & UTILS
// ==========================================

// Função de normalização para strings (Remove acentos, espaços e caixa alta)
function normalizeString(str) {
    if (!str) return "";
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// Função inteligente para resolver nome do colaborador baseado no e-mail
function resolveCollaboratorName(email) {
    if(!email) return "Colaborador";
    const prefix = email.split('@')[0];
    const normalizedPrefix = normalizeString(prefix);

    if (Object.keys(scheduleData).length > 0) {
        const matchKey = Object.keys(scheduleData).find(dbKey => {
            const normalizedDbKey = normalizeString(dbKey);
            // Compara "karinakrisan" com "karinakrisan"
            return normalizedDbKey === normalizedPrefix || normalizedDbKey.includes(normalizedPrefix);
        });
        if (matchKey) return matchKey;
    }
    
    // Fallback de formatação visual
    return prefix.replace(/\./g, ' ').split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
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

// === AUTH LISTENER PRINCIPAL ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuário detectado:", user.email);
        
        let isDatabaseAdmin = false;
        const userEmail = user.email.toLowerCase(); // Normaliza para verificação
        
        // --- 1. VERIFICAÇÃO DE ADMIN ---
        try {
            // A. Verifica por UID
            const adminDocRefUid = doc(db, "administradores", user.uid);
            const adminDocSnapUid = await getDoc(adminDocRefUid);
            
            // B. Verifica por Email (ID do Doc)
            const adminDocRefEmail = doc(db, "administradores", userEmail);
            const adminDocSnapEmail = await getDoc(adminDocRefEmail);

            if (adminDocSnapUid.exists() || adminDocSnapEmail.exists()) {
                isDatabaseAdmin = true;
            } else {
                // C. Verifica por campo 'email' na coleção (Query Case Insensitive manual)
                const q = query(collection(db, "administradores"), where("email", "==", userEmail));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) isDatabaseAdmin = true;
            }
        } catch (error) {
            console.error("Erro verificação admin:", error);
        }

        // Admins Estáticos (Adicione aqui o email que está com problema para garantir o acesso)
        const staticAdmins = ['admin@cronos.com', 'contatokarinakrisan@gmail.com', 'karina.krisan@sitelbra.com.br']; // Adicionado para teste

        if (isDatabaseAdmin || staticAdmins.includes(userEmail)) {
            console.log("Acesso concedido: ADMIN");
            setAdminMode(true);
            revealApp();
        } else {
            console.log("Acesso concedido: COLABORADOR");
            // Tenta buscar o nome real no DB de colaboradores
            let dbName = null;
            try {
                const collabDocRef = doc(db, "colaboradores", user.uid);
                const collabSnap = await getDoc(collabDocRef);
                if (collabSnap.exists()) dbName = collabSnap.data().nome;
            } catch (e) { console.error(e); }

            const finalName = dbName || resolveCollaboratorName(user.email);
            currentUserCollab = finalName;
            setupCollabMode(currentUserCollab);
            revealApp();
        }
        
        // Carrega dados APÓS determinar o usuário
        loadDataFromCloud();

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
        // Popula se estiver vazio
        if (empSelect.options.length <= 1 && Object.keys(scheduleData).length > 0) {
             Object.keys(scheduleData).sort().forEach(key => {
                const opt = document.createElement('option');
                opt.value = key; opt.textContent = key;
                empSelect.appendChild(opt);
            });
        }
        empSelect.value = name;
        empSelect.dispatchEvent(new Event('change'));
    }

    const personalTab = document.querySelector('[data-tab="personal"]');
    if(personalTab) personalTab.click();
    
    startRequestsListener();
}

const btnLogout = document.getElementById('btnLogout');
if(btnLogout) btnLogout.addEventListener('click', () => signOut(auth));

// ==========================================
// 5. MODO COLABORADOR - LOGIN & LOGOUT
// ==========================================
const collabModal = document.getElementById('collabLoginModal');
const btnLandingCollab = document.getElementById('btnLandingCollab');
const btnCancelCollab = document.getElementById('btnCancelCollabLogin');
const btnConfirmCollab = document.getElementById('btnConfirmCollabLogin');

if(btnLandingCollab) {
    btnLandingCollab.addEventListener('click', () => {
        const emailInput = document.getElementById('collabEmailInput');
        const passInput = document.getElementById('collabPassInput');
        if(emailInput) emailInput.value = '';
        if(passInput) passInput.value = '';
        collabModal.classList.remove('hidden');
    });
}

if(btnCancelCollab) btnCancelCollab.addEventListener('click', () => collabModal.classList.add('hidden'));

if(btnConfirmCollab) {
    btnConfirmCollab.addEventListener('click', async () => {
        const email = document.getElementById('collabEmailInput').value.trim();
        const pass = document.getElementById('collabPassInput').value;
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
    });
}

document.getElementById('btnCollabLogout')?.addEventListener('click', () => signOut(auth));


// ==========================================
// 6. FIRESTORE DATA (ESCALA)
// ==========================================
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            updateDailyView();
            initSelect();
            
            // Re-check nome colaborador após carregar dados
            const user = auth.currentUser;
            if (user && !isAdmin && user.email) {
                const betterName = resolveCollaboratorName(user.email);
                if (betterName !== currentUserCollab) {
                    currentUserCollab = betterName;
                    setupCollabMode(currentUserCollab);
                }
            }
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            processScheduleData(); // Limpa a tela
            updateDailyView();
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
            status.textContent = "Sincronizado";
            statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        }
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
        }, 1000);
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
// 8. NOTIFICAÇÕES
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
                <button onclick="window.acceptRequest('${id}', '${req.status}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold shadow-lg">${btnText}</button>
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

window.acceptRequest = async (id, currentStatus) => {
    if (currentStatus === 'pendente_colega') {
        await updateDoc(doc(db, "requests", id), { status: 'pendente_lider' });
        alert("Você concordou! Enviado para o líder.");
    }
    else if (currentStatus === 'pendente_lider' && isAdmin) {
        if(!confirm("Aprovar e aplicar alterações na escala?")) return;
        const reqSnap = await getDoc(doc(db, "requests", id));
        applyScheduleChange(reqSnap.data());
        await updateDoc(doc(db, "requests", id), { status: 'aprovado' });
        await saveToCloud();
        alert("Alteração aplicada!");
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

// ==========================================
// 9. FUNÇÕES DE RENDERIZAÇÃO E PROCESSAMENTO
// ==========================================

// Processa dados brutos do Firebase
function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;

    Object.keys(rawSchedule).forEach(name => {
        const scheduleArr = rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [];
        scheduleData[name] = {
            schedule: scheduleArr,
            info: rawSchedule[name].info || {}
        };
    });
}

// Atualiza a Visão Diária (KPIs e Gráfico)
function updateDailyView() {
    const dateLabel = document.getElementById('currentDateLabel');
    const day = currentDay;
    const month = monthNames[selectedMonthObj.month];
    if(dateLabel) dateLabel.textContent = `${day} de ${month}`;

    const listWorking = document.getElementById('listWorking');
    const listOff = document.getElementById('listOff');
    const listOffShift = document.getElementById('listOffShift');
    const listVacation = document.getElementById('listVacation');
    
    if(listWorking) listWorking.innerHTML = '';
    if(listOff) listOff.innerHTML = '';
    if(listOffShift) listOffShift.innerHTML = '';
    if(listVacation) listVacation.innerHTML = '';

    let cWorking = 0, cOff = 0, cOffShift = 0, cVacation = 0;

    Object.keys(scheduleData).sort().forEach(name => {
        const status = scheduleData[name].schedule[day - 1]; 
        const li = document.createElement('li');
        li.className = "text-xs p-2 rounded bg-[#1A1C2E] border border-[#2E3250] flex justify-between items-center";
        li.innerHTML = `<span class="font-bold text-gray-300">${name}</span> <span class="opacity-50 text-[10px]">${status || '-'}</span>`;

        if (status === 'T') {
            cWorking++;
            if(listWorking) listWorking.appendChild(li);
        } else if (['F', 'FS', 'FD'].includes(status)) {
            cOff++;
            if(listOff) listOff.appendChild(li);
        } else if (status === 'FE') {
            cVacation++;
            if(listVacation) listVacation.appendChild(li);
        } else {
            cOffShift++;
            if(listOffShift) listOffShift.appendChild(li);
        }
    });

    const kpiWorking = document.getElementById('kpiWorking');
    const kpiOff = document.getElementById('kpiOff');
    const kpiOffShift = document.getElementById('kpiOffShift');
    const kpiVacation = document.getElementById('kpiVacation');

    if(kpiWorking) kpiWorking.textContent = cWorking;
    if(kpiOff) kpiOff.textContent = cOff;
    if(kpiOffShift) kpiOffShift.textContent = cOffShift;
    if(kpiVacation) kpiVacation.textContent = cVacation;

    updateChart(cWorking, cOff, cOffShift, cVacation);
}

// Inicializa Select de Colaboradores
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    Object.keys(scheduleData).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
        const name = e.target.value;
        if (name && scheduleData[name]) renderPersonalCalendar(name);
        else document.getElementById('calendarContainer')?.classList.add('hidden');
    });
}

// Renderiza Calendário Individual
function renderPersonalCalendar(name) {
    const container = document.getElementById('calendarContainer');
    const grid = document.getElementById('calendarGrid');
    const infoCard = document.getElementById('personalInfoCard');
    
    if(!container || !grid) return;
    
    container.classList.remove('hidden');
    grid.innerHTML = '';
    
    if(infoCard) {
        infoCard.classList.remove('hidden');
        infoCard.innerHTML = `<h3 class="text-lg font-bold text-white">${name}</h3><p class="text-sm text-gray-400">Escala Mensal</p>`;
    }

    const schedule = scheduleData[name].schedule;
    
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
            if(isAdmin) alert(`Admin: Dia ${dayNum} de ${name}`);
            else if(currentUserCollab === name) openRequestModal(i);
        });

        grid.appendChild(cell);
    }
}

// Atualiza Gráfico Doughnut
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

// ==========================================
// 10. BOOTSTRAP
// ==========================================
function initGlobal() {
    // Abas
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
        ds.max = 31; // Simplificado
        ds.addEventListener('input', e => { 
            currentDay = parseInt(e.target.value); 
            updateDailyView(); 
        });
    }
    
    // Inicia carregamento
    loadDataFromCloud();
}

document.addEventListener('DOMContentLoaded', initGlobal);
