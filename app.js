import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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

// Estado
let isAdmin = false;
let currentUserName = null;
let scheduleData = {}; 
let rawSchedule = {};
let currentDay = new Date().getDate();
const currentDateObj = new Date();
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const availableMonths = [ { year: 2025, month: 10 }, { year: 2025, month: 11 }, { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, { year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 } ];
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[availableMonths.length-1];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
function pad(n){ return n < 10 ? '0' + n : '' + n; }

// --- AUTH & PERMISSIONS ---
const loadingOverlay = document.getElementById('appLoadingOverlay');
const adminToolbar = document.getElementById('adminToolbar');
const notificationWrapper = document.getElementById('notificationWrapper');

document.getElementById('btnLogout').addEventListener('click', async () => { await signOut(auth); window.location.href = "start.html"; });

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('start.html') && !window.location.pathname.includes('login-')) window.location.href = "start.html";
        return;
    }

    try {
        // ADMIN CHECK
        const adminRef = doc(db, "administradores", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            isAdmin = true;
            currentUserName = "Administrador";
            setupAdminUI();
            initNotificationsListener('admin');
        } else {
            // COLABORADOR CHECK
            isAdmin = false;
            const collabRef = doc(db, "colaboradores", user.uid);
            const collabSnap = await getDoc(collabRef);
            if(collabSnap.exists()) {
                currentUserName = collabSnap.data().name;
                setupCollaboratorUI(currentUserName);
                initNotificationsListener('peer');
            }
        }
        notificationWrapper.classList.remove('hidden');
    } catch (e) { console.error(e); } 
    finally { if(loadingOverlay) setTimeout(() => loadingOverlay.classList.add('hidden'), 500); }
    
    // Se for admin, carrega view diária. Se for colab, a view pessoal já foi forçada no setupCollaboratorUI
    if(isAdmin) updateDailyView();
});

// UI SETUP HELPERS
function setupAdminUI() {
    adminToolbar.classList.remove('hidden');
    document.getElementById('adminEditHint').classList.remove('hidden');
    document.body.style.paddingBottom = "100px";
    
    // Mostra todas as abas
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('employeeSelectContainer').classList.remove('hidden');
    
    // Default Tab
    switchTab('daily');
}

function setupCollaboratorUI(name) {
    adminToolbar.classList.add('hidden');
    document.getElementById('adminEditHint').classList.add('hidden');
    
    document.getElementById('welcomeUser').textContent = `Olá, ${name}`;
    document.getElementById('welcomeUser').classList.remove('hidden');

    // ESCONDE VISÃO DIÁRIA
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('dailyView').classList.add('hidden');

    // MOSTRA SOMENTE PESSOAL
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabPersonal').classList.add('active'); // Botão ativo
    document.getElementById('personalView').classList.remove('hidden'); // Conteúdo ativo
    
    // ESCONDE SELETOR DE OUTROS FUNCIONÁRIOS
    document.getElementById('employeeSelectContainer').classList.add('hidden');

    // FORÇA CARREGAMENTO DA ESCALA DO USUÁRIO
    // (Precisamos esperar os dados carregarem do Firestore primeiro, então chamamos isso dentro de loadData)
}

// --- DATA ---
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        rawSchedule = docSnap.exists() ? docSnap.data() : {};
        processScheduleData(); 
        
        // Se for admin, atualiza daily view.
        if(isAdmin) {
            updateDailyView();
            initSelect(); // Popula o dropdown
        } else if (currentUserName) {
            // Se for colaborador, atualiza view pessoal direto
            updatePersonalView(currentUserName);
        }

    } catch (e) { console.error(e); }
}

function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();
    Object.keys(rawSchedule).forEach(name => {
        let finalArr = rawSchedule[name].calculatedSchedule;
        if(!finalArr) finalArr = new Array(totalDays).fill('F'); 
        scheduleData[name] = { info: rawSchedule[name], schedule: finalArr };
    });
    const slider = document.getElementById('dateSlider');
    if (slider) { slider.max = totalDays; slider.value = currentDay; }
}

// --- TAB SWITCHING ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    const content = document.getElementById(`${tabName}View`);
    
    if(btn) btn.classList.add('active');
    if(content) content.classList.remove('hidden');
}

// Event listeners for Tabs
document.querySelectorAll('.tab-button').forEach(b => {
    b.addEventListener('click', () => {
        // Se for colaborador tentando clicar em daily, ignora
        if(!isAdmin && b.dataset.tab === 'daily') return;
        switchTab(b.dataset.tab);
    });
});


// --- VIEWS ---
function updateDailyView() {
    if(!isAdmin) return; // Segurança extra
    const dateLabel = document.getElementById('currentDateLabel');
    const dow = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
    dateLabel.textContent = `${daysOfWeek[dow]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}`;
    
    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    
    Object.keys(scheduleData).forEach(name=>{
        const st = scheduleData[name].schedule[currentDay-1] || 'F';
        const row = makeRow(name, st);
        if(st==='T') { w++; lists.w+=row; }
        else if(st==='FE') { v++; lists.v+=row; }
        else if(st.includes('OFF')) { os++; lists.os+=row; }
        else { o++; lists.o+=row; }
    });
    
    document.getElementById('kpiWorking').textContent=w; document.getElementById('kpiOff').textContent=o;
    document.getElementById('listWorking').innerHTML=lists.w; document.getElementById('listOff').innerHTML=lists.o;
}

function makeRow(name, st) { return `<li class="flex justify-between p-2 bg-[#1A1C2E] rounded border border-[#2E3250] mb-1"><span class="text-sm font-bold text-gray-300">${name}</span><span class="text-[10px] status-${st} px-2 rounded">${st}</span></li>`; }

function updatePersonalView(name) {
    if(!name || !scheduleData[name]) return;
    
    document.getElementById('personalInfoCard').classList.remove('hidden');
    document.getElementById('personalInfoCard').innerHTML = `<h2 class="text-white text-xl font-bold">${name}</h2>`;
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, scheduleData[name].schedule);
}

function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    const empty = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();
    for(let i=0;i<empty;i++) grid.innerHTML+='<div class="h-20 bg-[#1A1C2E] opacity-50"></div>';
    schedule.forEach((st, i) => {
        grid.innerHTML += `<div onclick="handleCellClick('${name}',${i})" class="h-20 bg-[#161828] border border-[#2E3250] p-1 cursor-pointer hover:bg-[#1F2136] relative group"><span class="text-gray-500 text-xs">${i+1}</span><div class="mt-2 text-center text-xs font-bold rounded status-${st}">${st}</div></div>`;
    });
}

// --- INTERACTION ---
window.handleCellClick = function(name, dayIndex) {
    if(isAdmin) {
        const emp = scheduleData[name];
        const arr = ['T','F','FE'];
        const next = arr[(arr.indexOf(emp.schedule[dayIndex])+1)%arr.length];
        emp.schedule[dayIndex] = next;
        rawSchedule[name].calculatedSchedule = emp.schedule;
        document.getElementById('saveStatus').textContent = "Alterado*";
        document.getElementById('saveStatus').classList.add('text-orange-400');
        updateCalendar(name, emp.schedule);
        return;
    }
    openRequestModal(name, dayIndex);
}

function openRequestModal(name, dayIndex) {
    if(currentUserName && name !== currentUserName) return;
    
    const d = new Date(selectedMonthObj.year, selectedMonthObj.month, dayIndex + 1);
    document.getElementById('reqDateDisplay').textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    document.getElementById('reqDateIndex').value = dayIndex;
    document.getElementById('reqEmployeeName').value = name;
    
    // Popula dropdown de colegas
    const targetSel = document.getElementById('reqTargetEmployee');
    targetSel.innerHTML = '<option value="">Selecione o colega...</option>';
    Object.keys(scheduleData).sort().forEach(n => {
        if(n !== name) targetSel.innerHTML += `<option value="${n}">${n}</option>`;
    });

    document.getElementById('requestModal').classList.remove('hidden');
}

document.getElementById('reqType').addEventListener('change', (e) => {
    const swapContainer = document.getElementById('swapTargetContainer');
    if(e.target.value === 'troca_folga') swapContainer.classList.remove('hidden');
    else swapContainer.classList.add('hidden');
});

document.getElementById('btnSendRequest').addEventListener('click', async () => {
    const btn = document.getElementById('btnSendRequest');
    const type = document.getElementById('reqType').value;
    const targetEmp = document.getElementById('reqTargetEmployee').value;
    const name = document.getElementById('reqEmployeeName').value;
    const idx = parseInt(document.getElementById('reqDateIndex').value);
    const reason = document.getElementById('reqReason').value;

    if(type === 'troca_folga' && !targetEmp) { alert("Selecione com quem deseja trocar."); return; }
    if(!reason) { alert("Informe o motivo."); return; }

    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const initialStatus = (type === 'troca_folga') ? 'pending_peer' : 'pending_leader';
        await addDoc(collection(db, "solicitacoes"), {
            monthId: `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`,
            requester: name,
            dayIndex: idx,
            type: type,
            target: targetEmp || null,
            reason: reason,
            status: initialStatus, 
            createdAt: serverTimestamp()
        });
        document.getElementById('requestModal').classList.add('hidden');
        alert("Solicitação enviada!");
    } catch(e) { console.error(e); alert("Erro ao enviar."); }
    finally { btn.innerHTML = 'Enviar'; btn.disabled = false; }
});

// --- NOTIFICATIONS ---
let notifUnsubscribe = null;
function initNotificationsListener(role) {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    let q;

    if (role === 'admin') {
        q = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("status", "==", "pending_leader"));
    } else {
        q = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", currentUserName), where("status", "==", "pending_peer"));
    }

    if(notifUnsubscribe) notifUnsubscribe();

    notifUnsubscribe = onSnapshot(q, (snapshot) => {
        const badge = document.getElementById('globalBadge');
        const list = document.getElementById('globalList');
        const title = document.getElementById('panelTitle');
        const count = snapshot.size;

        badge.textContent = count;
        badge.className = count > 0 ? "absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full" : "hidden";
        
        title.textContent = role === 'admin' ? "Aprovações Pendentes" : "Solicitações de Colegas";
        list.innerHTML = '';

        if(count === 0) { list.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nada pendente.</p>'; return; }

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const dateStr = `${pad(req.dayIndex+1)}/${pad(selectedMonthObj.month+1)}`;
            const isSwap = req.type === 'troca_folga';
            
            const div = document.createElement('div');
            div.className = "bg-[#0F1020] border border-cronos-border p-3 rounded-lg mb-2";
            
            let html = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-sky-400 font-bold text-xs uppercase">${req.requester}</span>
                        <div class="text-[10px] text-gray-400">Dia ${dateStr} • ${isSwap ? 'Troca com você' : 'Troca de Turno'}</div>
                    </div>
                </div>
                <p class="text-xs text-gray-300 italic bg-[#1A1C2E] p-2 rounded mb-2">"${req.reason}"</p>
            `;

            if (role === 'peer') {
                html += `<div class="flex gap-2"><button onclick="window.handleRequest('${docSnap.id}', 'peer_accept')" class="flex-1 bg-sky-600/20 text-sky-400 border border-sky-600/50 py-1.5 rounded text-xs font-bold hover:bg-sky-600 hover:text-white transition">Aceitar</button><button onclick="window.handleRequest('${docSnap.id}', 'reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Recusar</button></div>`;
            } else {
                html += `<div class="flex gap-2"><button onclick="window.handleRequest('${docSnap.id}', 'leader_approve', '${req.requester}', ${req.dayIndex}, '${req.target}')" class="flex-1 bg-emerald-600/20 text-emerald-400 border border-emerald-600/50 py-1.5 rounded text-xs font-bold hover:bg-emerald-600 hover:text-white transition">Aprovar</button><button onclick="window.handleRequest('${docSnap.id}', 'reject')" class="flex-1 bg-red-600/20 text-red-400 border border-red-600/50 py-1.5 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Reprovar</button></div>`;
            }
            div.innerHTML = html;
            list.appendChild(div);
        });
    });
}

window.handleRequest = async function(reqId, action, requesterName, dayIndex, targetName) {
    const reqRef = doc(db, "solicitacoes", reqId);
    try {
        if (action === 'reject') { await updateDoc(reqRef, { status: 'rejected' }); } 
        else if (action === 'peer_accept') {
            await updateDoc(reqRef, { status: 'pending_leader' });
            alert("Aceito! Enviado para o líder.");
        } 
        else if (action === 'leader_approve') {
            await updateDoc(reqRef, { status: 'approved' });
            if (targetName) {
                const reqStatus = scheduleData[requesterName].schedule[dayIndex];
                const targetStatus = scheduleData[targetName].schedule[dayIndex];
                scheduleData[requesterName].schedule[dayIndex] = targetStatus;
                scheduleData[targetName].schedule[dayIndex] = reqStatus;
                rawSchedule[requesterName].calculatedSchedule = scheduleData[requesterName].schedule;
                rawSchedule[targetName].calculatedSchedule = scheduleData[targetName].schedule;
            } else {
                const curr = scheduleData[requesterName].schedule[dayIndex];
                scheduleData[requesterName].schedule[dayIndex] = (curr === 'T') ? 'F' : 'T';
                rawSchedule[requesterName].calculatedSchedule = scheduleData[requesterName].schedule;
            }
            const docEscalaId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
            await setDoc(doc(db, "escalas", docEscalaId), rawSchedule, { merge: true });
            alert("Aprovado e atualizado.");
            loadDataFromCloud();
        }
    } catch (e) { console.error(e); alert("Erro ao processar."); }
}

const btnGlobal = document.getElementById('btnGlobalNotifications');
const panelGlobal = document.getElementById('globalPanel');
const closeGlobal = document.getElementById('btnCloseGlobal');
if(btnGlobal) btnGlobal.addEventListener('click', () => panelGlobal.classList.remove('hidden'));
if(closeGlobal) closeGlobal.addEventListener('click', () => panelGlobal.classList.add('hidden'));

// INIT
function initGlobal() {
    initSelect();
    const ds = document.getElementById('dateSlider');
    if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });
    // Month selector logic
    const header = document.getElementById('monthSelectorContainer');
    if(!document.getElementById('monthSel')) {
        const sel = document.createElement('select'); sel.id='monthSel';
        sel.className = 'bg-[#1A1C2E] text-white text-sm px-4 py-2 rounded-lg border border-[#2E3250] outline-none';
        availableMonths.forEach(m => {
            const opt = document.createElement('option'); opt.value = `${m.year}-${m.month}`;
            opt.textContent = `${monthNames[m.month]}/${m.year}`;
            if(m.month === selectedMonthObj.month && m.year === selectedMonthObj.year) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', e=>{ const [y,mo] = e.target.value.split('-').map(Number); selectedMonthObj={year:y, month:mo}; loadDataFromCloud(); });
        header.appendChild(sel);
    }
    loadDataFromCloud();
}
function initSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    s.innerHTML = '<option value="">Selecione...</option>';
    Object.keys(scheduleData).sort().forEach(n => { s.innerHTML += `<option value="${n}">${n}</option>`; });
    s.onchange = (e) => updatePersonalView(e.target.value);
}
document.addEventListener('DOMContentLoaded', initGlobal);
