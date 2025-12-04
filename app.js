// app.js - Cronos Workforce Management
// ==========================================
// 1. IMPORTAÇÕES FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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
let currentUserCollab = null; // Nome do colaborador logado
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
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. GESTÃO DE ACESSO (Landing Page vs App)
// ==========================================
const landingPage = document.getElementById('landingPage');
const appInterface = document.getElementById('appInterface');

function revealApp() {
    landingPage.classList.add('hidden');
    appInterface.classList.remove('hidden');
    setTimeout(() => {
        appInterface.classList.remove('opacity-0');
    }, 50);
}

function hideApp() {
    appInterface.classList.add('opacity-0');
    setTimeout(() => {
        appInterface.classList.add('hidden');
        landingPage.classList.remove('hidden');
    }, 500);
}

// === AUTH LISTENER PRINCIPAL ===
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Se o email for admin@cronos.com (ou outro criterio), ativa modo Admin
        if (user.email === 'admin@cronos.com') {
            setAdminMode(true);
            revealApp();
        } else {
            // Lógica para extrair nome do colaborador do email
            const nameFromEmail = user.email.split('@')[0];
            const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
            
            // Busca fuzzy para encontrar o nome na escala
            const matchName = Object.keys(scheduleData).find(n => n.toLowerCase().includes(nameFromEmail.toLowerCase()));
            
            currentUserCollab = matchName || formattedName;
            setupCollabMode(currentUserCollab);
            revealApp();
        }
    } else {
        hideApp();
    }
    updateDailyView();
});

function setAdminMode(active) {
    isAdmin = active;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); // Botão da Visão Diária
    
    if(active) {
        adminToolbar.classList.remove('hidden');
        collabToolbar.classList.add('hidden'); 
        document.getElementById('adminEditHint').classList.remove('hidden');
        document.getElementById('collabEditHint').classList.add('hidden');
        document.body.style.paddingBottom = "100px";
        
        // Admin deve ver a Visão Diária
        if(dailyTabBtn) dailyTabBtn.classList.remove('hidden');
        
        startRequestsListener();
    } else {
        adminToolbar.classList.add('hidden');
        document.getElementById('adminEditHint').classList.add('hidden');
    }
}

function setupCollabMode(name) {
    isAdmin = false;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); // Botão da Visão Diária
    
    adminToolbar.classList.add('hidden');
    collabToolbar.classList.remove('hidden');
    
    document.getElementById('collabNameDisplay').textContent = name;
    document.getElementById('collabEditHint').classList.remove('hidden');
    document.getElementById('adminEditHint').classList.add('hidden');
    document.body.style.paddingBottom = "100px";

    // COLABORADOR NÃO VÊ A VISÃO DIÁRIA (REGRA 1)
    if(dailyTabBtn) dailyTabBtn.classList.add('hidden');

    // Auto-select na view pessoal
    const empSelect = document.getElementById('employeeSelect');
    if(empSelect) {
        empSelect.value = name;
        if(empSelect.selectedIndex === -1) {
             for (let i = 0; i < empSelect.options.length; i++) {
                if (empSelect.options[i].text.toLowerCase().includes(name.toLowerCase())) {
                    empSelect.selectedIndex = i;
                    break;
                }
            }
        }
        empSelect.dispatchEvent(new Event('change'));
    }

    // Força ir para a tab pessoal automaticamente
    const personalTab = document.querySelector('[data-tab="personal"]');
    if(personalTab) personalTab.click();
    
    startRequestsListener();
}

// Logout Global
const btnLogout = document.getElementById('btnLogout');
if(btnLogout) btnLogout.addEventListener('click', () => signOut(auth));


// ==========================================
// 5. MODO COLABORADOR - LOGIN & LOGOUT
// ==========================================
const collabModal = document.getElementById('collabLoginModal');
const btnLandingCollab = document.getElementById('btnLandingCollab');
const btnCancelCollab = document.getElementById('btnCancelCollabLogin');
const btnConfirmCollab = document.getElementById('btnConfirmCollabLogin');

// Abrir modal na landing page
if(btnLandingCollab) {
    btnLandingCollab.addEventListener('click', () => {
        document.getElementById('collabEmailInput').value = '';
        document.getElementById('collabPassInput').value = '';
        collabModal.classList.remove('hidden');
    });
}

btnCancelCollab.addEventListener('click', () => collabModal.classList.add('hidden'));

// Ação de Login do Colaborador
btnConfirmCollab.addEventListener('click', async () => {
    const email = document.getElementById('collabEmailInput').value;
    const pass = document.getElementById('collabPassInput').value;
    const btn = btnConfirmCollab;

    if(!email || !pass) return alert("Preencha todos os campos.");

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await signInWithEmailAndPassword(auth, email, pass);
        // O onAuthStateChanged vai lidar com o resto
        collabModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        alert("Erro no login: Verifique e-mail e senha.");
    } finally {
        btn.innerHTML = 'Entrar';
    }
});

// Logout Colaborador
document.getElementById('btnCollabLogout').addEventListener('click', () => {
    signOut(auth);
    // onAuthStateChanged chamará hideApp() automaticamente
});


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
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            processScheduleData();
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
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium transition-colors";
        statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
        }, 1000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        btn.innerHTML = 'Erro';
    }
}
document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// ==========================================
// 7. LÓGICA DE SOLICITAÇÕES (REQUESTS)
// ==========================================
const requestModal = document.getElementById('requestModal');
const btnCloseReq = document.getElementById('btnCloseRequestModal');
const btnSubmitReq = document.getElementById('btnSubmitRequest');
const targetPeerSelect = document.getElementById('targetPeerSelect');
let selectedRequestDate = null;
let selectedRequestType = 'troca_folga'; 

// Abrir Modal de Solicitação
function openRequestModal(dayIndex) {
    if(!currentUserCollab) return;
    selectedRequestDate = dayIndex;
    
    const dateStr = `${pad(dayIndex+1)}/${pad(selectedMonthObj.month+1)}`;
    document.getElementById('requestDateLabel').textContent = `Para o dia ${dateStr}`;
    
    // Reset campos
    document.getElementById('newShiftInput').value = '';
    targetPeerSelect.innerHTML = '<option value="">Selecione um colega...</option>';
    
    Object.keys(scheduleData).sort().forEach(name => {
        // Mostra todos exceto o próprio usuário (busca parcial para garantir)
        if(!name.toLowerCase().includes(currentUserCollab.toLowerCase())) {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            targetPeerSelect.appendChild(opt);
        }
    });

    requestModal.classList.remove('hidden');
}

// Tabs dentro do Modal
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

btnCloseReq.addEventListener('click', () => requestModal.classList.add('hidden'));

// Enviar Solicitação para Firestore
btnSubmitReq.addEventListener('click', async () => {
    if(!selectedRequestDate && selectedRequestDate !== 0) return;
    
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
        // FLUXO: Colega primeiro (pendente_colega)
        reqData.status = 'pendente_colega'; 
        reqData.description = `quer trocar folga com você no dia ${reqData.dayLabel}`;
    } else {
        const newShift = document.getElementById('newShiftInput').value;
        if(!newShift) return alert("Digite o turno desejado.");
        reqData.newDetail = newShift;
        // FLUXO: Direto para o Líder (pendente_lider)
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

// ==========================================
// 8. GERENCIAMENTO DE NOTIFICAÇÕES (DRAWER)
// ==========================================
const drawer = document.getElementById('notificationDrawer');
const list = document.getElementById('notificationList');
const badges = { admin: document.getElementById('adminBadge'), collab: document.getElementById('collabBadge') };

document.getElementById('btnAdminRequests')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCollabInbox')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCloseDrawer').addEventListener('click', () => drawer.classList.remove('translate-x-0'));

function openDrawer() {
    drawer.classList.add('translate-x-0');
}

function startRequestsListener() {
    const q = query(collection(db, "requests"), where("monthYear", "==", `${selectedMonthObj.year}-${selectedMonthObj.month}`));
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        let count = 0;
        
        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const rid = docSnap.id;
            
            // FILTROS DE VISUALIZAÇÃO
            let show = false;
            let canAction = false;
            
            if (isAdmin) {
                // Admin vê solicitações que já passaram pelo colega ou são diretas
                if (req.status === 'pendente_lider') {
                    show = true;
                    canAction = true;
                    count++;
                }
            } else if (currentUserCollab) {
                // Colaborador (ex: Gabriel) vê solicitações enviadas PARA ele (ex: de Karina)
                if (req.status === 'pendente_colega' && req.target.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true;
                    canAction = true;
                    count++;
                }
                // Vê status dos próprios pedidos (mas não age)
                if (req.requester.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true;
                    canAction = false;
                }
            }

            if (show) {
                renderRequestItem(rid, req, canAction);
            }
        });

        if(isAdmin) {
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

// Ações Globais
window.rejectRequest = async (id) => {
    if(!confirm("Rejeitar solicitação?")) return;
    await updateDoc(doc(db, "requests", id), { status: 'rejeitado' });
}

window.acceptRequest = async (id, currentStatus) => {
    // 1. FLUXO COLEGA (Gabriel aceita troca com Karina)
    // O status muda para 'pendente_lider', enviando para o painel do Admin.
    if (currentStatus === 'pendente_colega') {
        await updateDoc(doc(db, "requests", id), { status: 'pendente_lider' });
        alert("Você concordou! Agora a solicitação foi para o líder.");
    }
    // 2. FLUXO LÍDER (Aprova troca ou mudança de turno)
    else if (currentStatus === 'pendente_lider' && isAdmin) {
        if(!confirm("Aprovar e aplicar alterações na escala?")) return;
        
        const reqSnap = await getDoc(doc(db, "requests", id));
        const req = reqSnap.data();

        applyScheduleChange(req);

        await updateDoc(doc(db, "requests", id), { status: 'aprovado' });
        await saveToCloud();
        alert("Alteração aplicada com sucesso!");
    }
}

function applyScheduleChange(req) {
    const idx = req.dayIndex;
    
    if (req.type === 'troca_folga') {
        // Troca simples de status
        const statusA = rawSchedule[req.requester].calculatedSchedule[idx];
        const statusB = rawSchedule[req.target].calculatedSchedule[idx];
        
        rawSchedule[req.requester].calculatedSchedule[idx] = statusB;
        rawSchedule[req.target].calculatedSchedule[idx] = statusA;
        
        scheduleData[req.requester].schedule[idx] = statusB;
        scheduleData[req.target].schedule[idx] = statusA;

    } else if (req.type === 'mudanca_turno') {
        // Log para futura implementação complexa de horários por dia
        console.log(`Alterar turno de ${req.requester} no dia ${req.dayLabel} para ${req.newDetail}`);
    }
}


// ==========================================
// 8. PROCESSAMENTO E UI (Core Logic)
// ==========================================
function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const arr = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        arr.push((dow===0||dow===6) ? 'F' : 'T');
    }
    return arr;
}

function parseDayListForMonth(dayString, monthObj) {
    if (!dayString) return [];
    if (Array.isArray(dayString)) return dayString; 
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const days = new Set();
    const normalized = String(dayString).replace(/\b(at[eé]|até|a)\b/gi,' a ').replace(/–|—/g,'-').replace(/\s+/g,' ').trim();
    const parts = normalized.split(',').map(p=>p.trim()).filter(p=>p.length>0);

    parts.forEach(part=>{
        const simple = part.match(/^(\d{1,2})-(\d{1,2})$/);
        if (simple) { for(let x=parseInt(simple[1]); x<=parseInt(simple[2]); x++) if(x>=1 && x<=totalDays) days.add(x); return; }
        const number = part.match(/^(\d{1,2})$/);
        if (number) { const v=parseInt(number[1]); if(v>=1 && v<=totalDays) days.add(v); return; }
        if (/fins? de semana|fim de semana/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow===0||dow===6) days.add(d); }
            return;
        }
        if (/segunda a sexta/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ const dow = new Date(monthObj.year, monthObj.month, d).getDay(); if (dow>=1 && dow<=5) days.add(d); }
            return;
        }
    });
    return Array.from(days).sort((a,b)=>a-b);
}

function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    if (employeeData.calculatedSchedule && Array.isArray(employeeData.calculatedSchedule)) return employeeData.calculatedSchedule;

    const schedule = new Array(totalDays).fill(null);
    let tArr = [];
    if(typeof employeeData.T === 'string' && /segunda a sexta/i.test(employeeData.T)) tArr = generate5x2ScheduleDefaultForMonth(monthObj);
    else if(Array.isArray(employeeData.T)) {
        const arr = new Array(totalDays).fill('F');
        employeeData.T.forEach(x => { if(typeof x === 'number') arr[x-1] = 'T'; });
        tArr = arr;
    }

    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });
    const fsDays = parseDayListForMonth(employeeData.FS, monthObj);
    fsDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FS'; });
    const fdDays = parseDayListForMonth(employeeData.FD, monthObj);
    fdDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });

    for(let i=0; i<totalDays; i++) {
        if(!schedule[i]) {
            if(tArr[i] === 'T') schedule[i] = 'T';
            else schedule[i] = 'F';
        }
    }
    return schedule;
}

function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;
    Object.keys(rawSchedule).forEach(name => {
        const finalArr = buildFinalScheduleForMonth(rawSchedule[name], selectedMonthObj);
        scheduleData[name] = { info: rawSchedule[name], schedule: finalArr };
        rawSchedule[name].calculatedSchedule = finalArr;
    });
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();
    const slider = document.getElementById('dateSlider');
    if (slider) {
        slider.max = totalDays;
        document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}

// Chart Logic
function updateDailyView() {
    const currentDateLabel = document.getElementById('currentDateLabel');
    if(currentDateLabel) {
        const dayOfWeekIndex = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
        currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}`;
    }

    let w=0, o=0, v=0, os=0;
    let wH='', oH='', vH='', osH='';

    if (Object.keys(scheduleData).length === 0) return;

    Object.keys(scheduleData).forEach(name=>{
        const emp = scheduleData[name];
        let status = emp.schedule[currentDay-1] || 'F';
        let display = status;
        
        if(status === 'T') w++; else if(status === 'FE') v++; else o++;

        const row = `
            <li class="flex justify-between items-center text-sm p-4 rounded-xl mb-2 bg-[#1A1C2E] hover:bg-[#2E3250] border border-[#2E3250] hover:border-purple-500 transition-all shadow-sm">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-200">${name}</span>
                    <span class="text-[10px] text-gray-500 font-mono">${emp.info.Horário||'--'}</span>
                </div>
                <span class="day-status status-${display} rounded-lg px-2.5 py-1 text-[10px] font-bold tracking-wide border-0 bg-opacity-10">${statusMap[display]||display}</span>
            </li>`;
        if (status==='T') wH+=row; else if (['FE'].includes(status)) vH+=row; else oH+=row;
    });
    
    document.getElementById('kpiWorking').textContent = w;
    document.getElementById('kpiOff').textContent = o;
    document.getElementById('kpiVacation').textContent = v;
    document.getElementById('listWorking').innerHTML = wH;
    document.getElementById('listOff').innerHTML = oH;
    document.getElementById('listVacation').innerHTML = vH;
    
    renderMonthlyTrendChart();
}

function renderMonthlyTrendChart() {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if(dailyChart) dailyChart.destroy();
    dailyChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Ativos', 'Folga'],
            datasets: [{ data: [parseInt(document.getElementById('kpiWorking').textContent), parseInt(document.getElementById('kpiOff').textContent)], backgroundColor: ['#34D399', '#FBBF24'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
}

// ==========================================
// 9. PERSONAL VIEW & CALENDAR INTERACTIONS
// ==========================================
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    
    if (currentUserCollab) {
        select.innerHTML = `<option value="${currentUserCollab}">${currentUserCollab}</option>`;
        select.disabled = true;
    } else {
        select.innerHTML = '<option value="">Selecione um colaborador</option>';
        Object.keys(scheduleData).sort().forEach(name=>{
            const opt = document.createElement('option'); opt.value=name; opt.textContent=name; select.appendChild(opt);
        });
        select.disabled = false;
    }
    
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', e => {
        if(e.target.value) updatePersonalView(e.target.value);
    });
}

function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    
    card.classList.remove('hidden');
    card.className = "mb-8 bg-[#1A1C2E] rounded-xl border border-[#2E3250] overflow-hidden";
    card.innerHTML = `
        <div class="px-6 py-5 flex justify-between items-center bg-gradient-to-r from-[#1A1C2E] to-[#2E3250]/30">
            <div>
                <h2 class="text-xl md:text-2xl font-bold text-white tracking-tight">${name}</h2>
                <p class="text-purple-400 text-xs font-bold uppercase tracking-widest mt-1">${emp.info.Cargo || 'Colaborador'}</p>
            </div>
        </div>
    `;

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    grid.className = 'calendar-grid-container';
    
    const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
    const empty = new Date(m.y, m.mo, 1).getDay();
    for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-[#1A1C2E] opacity-50"></div>');
    
    schedule.forEach((st, i) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell relative group hover:bg-[#2E3250] transition-colors";
        
        // INTERAÇÃO: Admin edita direto, Colaborador abre Modal
        if (isAdmin || (currentUserCollab === name)) {
            cell.classList.add('cursor-pointer');
            cell.onclick = () => {
                if(isAdmin) handleAdminClick(name, i);
                else openRequestModal(i);
            };
        }

        cell.innerHTML = `
            <div class="day-number group-hover:text-white transition-colors">${pad(i+1)}</div>
            <div class="day-status-badge status-${st}">${statusMap[st]||st}</div>
        `;
        grid.appendChild(cell);
    });
}

function handleAdminClick(name, dayIndex) {
    const emp = scheduleData[name];
    const sequence = ['T', 'F', 'FS', 'FD', 'FE'];
    let current = emp.schedule[dayIndex];
    let next = sequence[(sequence.indexOf(current) + 1) % sequence.length];
    
    emp.schedule[dayIndex] = next;
    rawSchedule[name].calculatedSchedule = emp.schedule;
    
    const statusEl = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    if(statusEl) {
        statusEl.textContent = "Alterado (Não salvo)";
        statusEl.className = "text-xs text-orange-400 font-bold";
        statusIcon.className = "w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse";
    }

    updateCalendar(name, emp.schedule);
}

// ==========================================
// 10. BOOTSTRAP
// ==========================================
function initGlobal() {
    initTabs();
    const ds = document.getElementById('dateSlider');
    if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });
    
    // Baixa dados em memória (mas não mostra UI até logar)
    loadDataFromCloud();
}

function initTabs() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
        });
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);
