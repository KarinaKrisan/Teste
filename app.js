// app.js - Versão Corrigida (Loading Fix)
// ==========================================
// 1. IMPORTAÇÕES FIREBASE
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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
let hasUnsavedChanges = false;
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let isTrendMode = false;
let currentDay = new Date().getDate();

const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 

const availableMonths = [
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, 
    { year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 }
];

let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[availableMonths.length-1];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. AUTH & LÓGICA DE PROTEÇÃO (CORRIGIDO)
// ==========================================
const adminToolbar = document.getElementById('adminToolbar');
const btnLogout = document.getElementById('btnLogout');
// A LINHA ABAIXO ESTAVA FALTANDO E CAUSAVA O TRAVAMENTO:
const loadingOverlay = document.getElementById('appLoadingOverlay'); 

if(btnLogout) btnLogout.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = "start.html";
});

onAuthStateChanged(auth, async (user) => {
    // 1. SE NÃO TIVER USUÁRIO LOGADO:
    if (!user) {
        const path = window.location.pathname;
        // Se não estivermos já na tela de start ou logins, redireciona
        if (!path.includes('start.html') && !path.includes('login-')) {
            window.location.href = "start.html";
        }
        return;
    }

    // 2. SE TIVER USUÁRIO LOGADO:
    const loginContainer = document.getElementById('loginButtonsContainer');
    if(loginContainer) loginContainer.classList.add('hidden');

    try {
        const adminRef = doc(db, "administradores", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            isAdmin = true;
            if(adminToolbar) adminToolbar.classList.remove('hidden');
            document.getElementById('adminEditHint')?.classList.remove('hidden');
            document.body.style.paddingBottom = "100px";
            initAdminRequestsListener();
            console.log("Admin conectado");
        } else {
            isAdmin = false;
            if(adminToolbar) adminToolbar.classList.add('hidden');
            document.getElementById('adminEditHint')?.classList.add('hidden');
            console.log("Colaborador conectado");
        }
    } catch (e) {
        console.error("Erro verificação:", e);
        isAdmin = false;
    } finally {
        // AGORA ESSA VARIÁVEL EXISTE, ENTÃO O LOADING VAI SUMIR
        if(loadingOverlay) {
            loadingOverlay.classList.add('opacity-0');
            setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
        }
    }
    
    updateDailyView();
});

// ==========================================
// 5. FIRESTORE DATA
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
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
        if(isAdmin) initAdminRequestsListener();
    } catch (e) { console.error("Erro dados:", e); }
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    btn.classList.add('opacity-75');
    
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        hasUnsavedChanges = false;
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium";
        if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
            btn.classList.remove('opacity-75');
        }, 1000);
    } catch (e) { alert("Erro ao salvar!"); }
}

if(document.getElementById('btnSaveCloud')) document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// ==========================================
// 6. PROCESSAMENTO DE DADOS
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
    if (slider) { slider.max = totalDays; document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`; if (currentDay > totalDays) currentDay = totalDays; slider.value = currentDay; }
}

// ==========================================
// 7. CHART & UI
// ==========================================
function parseSingleTimeRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const m = rangeStr.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { startTotal: parseInt(m[1])*60 + parseInt(m[2]), endTotal: parseInt(m[3])*60 + parseInt(m[4]) };
}
function isWorkingTime(timeRange) {
    if (!timeRange || /12x36/i.test(timeRange)) return true;
    const now = new Date();
    const curr = now.getHours()*60 + now.getMinutes();
    const p = parseSingleTimeRange(timeRange);
    if (!p) return true;
    if (p.startTotal > p.endTotal) { if (curr >= p.startTotal || curr <= p.endTotal) return true; }
    else { if (curr >= p.startTotal && curr <= p.endTotal) return true; }
    return false;
}
window.toggleChartMode = function() {
    isTrendMode = !isTrendMode;
    const btn = document.getElementById("btnToggleChart");
    const title = document.getElementById("chartTitle");
    if (isTrendMode) { if(btn) btn.textContent = "Voltar"; if(title) title.textContent = "Tendência Mensal"; renderMonthlyTrendChart(); }
    else { if(btn) btn.textContent = "Ver Tendência"; if(title) title.textContent = "Capacidade Atual"; updateDailyView(); }
}
function renderMonthlyTrendChart() {
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
    const labels = []; const dataPoints = [];
    for (let d = 1; d <= totalDays; d++) {
        let working = 0, totalStaff = 0;
        Object.keys(scheduleData).forEach(name => {
            const status = scheduleData[name].schedule[d-1];
            if (status === 'T') working++;
            if (status !== 'FE') totalStaff++;
        });
        labels.push(d); dataPoints.push(totalStaff > 0 ? ((working/totalStaff)*100).toFixed(0) : 0);
    }
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart) { dailyChart.destroy(); }
    dailyChart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Capacidade (%)', data: dataPoints, borderColor: '#7C3AED', backgroundColor: 'rgba(124, 58, 237, 0.15)', fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } }
    });
}
function updateDailyChartDonut(w, o, os, v) {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart && dailyChart.config.type !== 'doughnut') { dailyChart.destroy(); dailyChart = null; }
    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Trabalhando','Folga','Encerrado','Férias'], datasets:[{ data: [w,o,os,v], backgroundColor: ['#34D399','#FBBF24','#E879F9','#F87171'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position:'bottom', labels: { color: '#94A3B8' } } } }
        });
    } else { dailyChart.data.datasets[0].data = [w,o,os,v]; dailyChart.update(); }
}
function updateDailyView() {
    if (isTrendMode) window.toggleChartMode();
    const currentDateLabel = document.getElementById('currentDateLabel');
    const dayOfWeekIndex = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}`;
    let w=0, o=0, v=0, os=0;
    let wH='', oH='', vH='', osH='';
    const isToday = (new Date().getDate() === currentDay && new Date().getMonth() === selectedMonthObj.month);

    Object.keys(scheduleData).forEach(name=>{
        const emp = scheduleData[name];
        let status = emp.schedule[currentDay-1] || 'F';
        let display = status;
        if (status === 'FE') { v++; display='FE'; }
        else if (isToday && status === 'T') { if (!isWorkingTime(emp.info.Horário)) { os++; display='OFF-SHIFT'; status='F_EFFECTIVE'; } else w++; }
        else if (status === 'T') w++; else o++; 
        
        const row = `<li class="flex justify-between items-center text-sm p-3 rounded-xl mb-2 bg-[#1A1C2E] border border-[#2E3250]">
            <div class="flex flex-col"><span class="font-bold text-gray-200">${name}</span><span class="text-[10px] text-gray-500 font-mono">${emp.info.Horário||'--'}</span></div>
            <span class="day-status status-${display} rounded-lg px-2 py-1 text-[10px] font-bold">${statusMap[display]||display}</span></li>`;
        if (status==='T') wH+=row; else if (status==='F_EFFECTIVE') osH+=row; else if (['FE'].includes(status)) vH+=row; else oH+=row;
    });
    document.getElementById('kpiWorking').textContent = w; document.getElementById('kpiOffShift').textContent = os;
    document.getElementById('kpiOff').textContent = o; document.getElementById('kpiVacation').textContent = v;
    document.getElementById('listWorking').innerHTML = wH; document.getElementById('listOffShift').innerHTML = osH;
    document.getElementById('listOff').innerHTML = oH; document.getElementById('listVacation').innerHTML = vH;
    updateDailyChartDonut(w, o, os, v);
}

// ==========================================
// 8. INTERATIVIDADE CALENDÁRIO & REQUESTS
// ==========================================
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    Object.keys(scheduleData).sort().forEach(name=>{ const opt = document.createElement('option'); opt.value=name; opt.textContent=name; select.appendChild(opt); });
    const newSelect = select.cloneNode(true); select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', e => { if(e.target.value) updatePersonalView(e.target.value); else document.getElementById('calendarContainer').classList.add('hidden'); });
}

function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    document.getElementById('personalInfoCard').innerHTML = `<h2 class="text-xl font-bold text-white">${name}</h2><p class="text-purple-400 text-xs font-bold">${emp.info.Cargo||'Colaborador'}</p>`;
    document.getElementById('personalInfoCard').classList.remove('hidden');
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

function cycleStatus(current) {
    const sequence = ['T', 'F', 'FS', 'FD', 'FE'];
    let idx = sequence.indexOf(current);
    return idx === -1 ? 'T' : sequence[(idx + 1) % sequence.length];
}

window.handleCellClick = async function(name, dayIndex) {
    if (isAdmin) {
        // ADMIN MODE: Edita direto
        const emp = scheduleData[name];
        emp.schedule[dayIndex] = cycleStatus(emp.schedule[dayIndex]);
        rawSchedule[name].calculatedSchedule = emp.schedule;
        hasUnsavedChanges = true;
        const statusEl = document.getElementById('saveStatus');
        if(statusEl) { statusEl.textContent = "Alterado (Não salvo)"; statusEl.className = "text-xs text-orange-400 font-bold"; }
        updateCalendar(name, emp.schedule);
        updateDailyView();
        return;
    }
    // COLABORADOR MODE: Abre modal
    openRequestModal(name, dayIndex);
}

function openRequestModal(name, dayIndex) {
    const modal = document.getElementById('requestModal');
    const d = new Date(selectedMonthObj.year, selectedMonthObj.month, dayIndex + 1);
    document.getElementById('reqDateDisplay').textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    document.getElementById('reqDateIndex').value = dayIndex;
    document.getElementById('reqEmployeeName').value = name;
    modal.classList.remove('hidden');
}

if(document.getElementById('btnSendRequest')) document.getElementById('btnSendRequest').addEventListener('click', async () => {
    const btn = document.getElementById('btnSendRequest');
    const name = document.getElementById('reqEmployeeName').value;
    const dayIndex = parseInt(document.getElementById('reqDateIndex').value);
    const type = document.getElementById('reqType').value;
    const reason = document.getElementById('reqReason').value;
    
    if(!reason) { alert("Justificativa obrigatória."); return; }
    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        await addDoc(collection(db, "solicitacoes"), {
            monthId: `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`,
            employee: name,
            dayIndex: dayIndex,
            type: type,
            reason: reason,
            status: 'pending',
            createdAt: serverTimestamp(),
            currentStatus: scheduleData[name].schedule[dayIndex]
        });
        document.getElementById('requestModal').classList.add('hidden');
        alert("Solicitação enviada!");
        document.getElementById('reqReason').value = '';
    } catch (e) { alert("Erro ao enviar."); } 
    finally { btn.innerHTML = '<span>Enviar Solicitação</span><i class="fas fa-paper-plane"></i>'; btn.disabled = false; }
});

function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    const isMobile = window.innerWidth <= 767;
    grid.innerHTML = '';
    if(isMobile) {
        grid.className = 'space-y-2 mt-4';
        schedule.forEach((st, i) => {
            grid.innerHTML += `<div onclick="handleCellClick('${name}', ${i})" class="flex justify-between items-center p-3 rounded-xl border bg-[#1A1C2E] border-[#2E3250] text-gray-300 cursor-pointer"><span class="font-mono text-gray-500">Dia ${pad(i+1)}</span><span class="day-status status-${st}">${statusMap[st]||st}</span></div>`;
        });
    } else {
        grid.className = 'calendar-grid-container';
        const empty = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-[#1A1C2E] opacity-50"></div>');
        schedule.forEach((st, i) => {
            const cell = document.createElement('div');
            cell.className = "calendar-cell relative group cursor-pointer hover:bg-[#1F2136]";
            cell.onclick = () => handleCellClick(name, i);
            cell.innerHTML = `<div class="day-number group-hover:text-white">${pad(i+1)}</div><div class="day-status-badge status-${st}">${statusMap[st]||st}</div>`;
            grid.appendChild(cell);
        });
    }
}

// ==========================================
// 9. ADMIN REQUESTS LOGIC
// ==========================================
let requestsUnsubscribe = null;
function initAdminRequestsListener() {
    if(!isAdmin) return;
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    const q = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("status", "==", "pending"));
    
    if(requestsUnsubscribe) requestsUnsubscribe();
    requestsUnsubscribe = onSnapshot(q, (snapshot) => {
        const badge = document.getElementById('badgeRequests');
        const list = document.getElementById('requestsList');
        const count = snapshot.size;
        
        if(count>0) { badge.textContent=count; badge.classList.remove('hidden'); document.getElementById('btnNotifications').classList.add('text-orange-400','animate-pulse'); }
        else { badge.classList.add('hidden'); document.getElementById('btnNotifications').classList.remove('text-orange-400','animate-pulse'); }

        list.innerHTML = '';
        if(count===0) { list.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nenhuma solicitação.</p>'; return; }

        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const dateStr = `${pad(req.dayIndex+1)}/${pad(selectedMonthObj.month+1)}`;
            const item = document.createElement('div');
            item.className = "bg-[#0F1020] border border-cronos-border p-3 rounded-lg flex flex-col gap-2";
            item.innerHTML = `
                <div class="flex justify-between items-start">
                    <div><span class="text-xs font-bold text-sky-400 uppercase">${req.employee}</span><div class="text-[10px] text-gray-400 font-mono">Dia ${dateStr} • ${req.type}</div></div>
                    <span class="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-400 font-mono">${req.currentStatus}</span>
                </div>
                <p class="text-xs text-gray-300 italic bg-[#1A1C2E] p-2 rounded">"${req.reason}"</p>
                <div class="flex gap-2 mt-1">
                    <button onclick="window.processRequest('${docSnap.id}', '${req.employee}', ${req.dayIndex}, 'approve')" class="flex-1 bg-emerald-900/40 text-emerald-400 border border-emerald-600/30 py-1 rounded text-xs font-bold hover:bg-emerald-600 hover:text-white transition">Aprovar</button>
                    <button onclick="window.processRequest('${docSnap.id}', null, null, 'reject')" class="flex-1 bg-red-900/40 text-red-400 border border-red-600/30 py-1 rounded text-xs font-bold hover:bg-red-600 hover:text-white transition">Recusar</button>
                </div>`;
            list.appendChild(item);
        });
    });
}

window.processRequest = async function(reqId, employeeName, dayIndex, action) {
    const reqRef = doc(db, "solicitacoes", reqId);
    try {
        if(action === 'reject') { await updateDoc(reqRef, { status: 'rejected' }); }
        else if (action === 'approve') {
            await updateDoc(reqRef, { status: 'approved' });
            // Lógica simples: Toggle T <-> F
            const current = scheduleData[employeeName].schedule[dayIndex];
            const newSt = (current === 'T') ? 'F' : 'T';
            scheduleData[employeeName].schedule[dayIndex] = newSt;
            rawSchedule[employeeName].calculatedSchedule = scheduleData[employeeName].schedule;
            
            const docEscalaId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
            await setDoc(doc(db, "escalas", docEscalaId), rawSchedule, { merge: true });
            
            updateCalendar(employeeName, scheduleData[employeeName].schedule);
            updateDailyView();
        }
    } catch (e) { alert("Erro ao processar."); }
}

const btnNotif = document.getElementById('btnNotifications');
if(btnNotif) btnNotif.addEventListener('click', () => document.getElementById('requestsPanel').classList.toggle('hidden'));
if(document.getElementById('btnCloseRequests')) document.getElementById('btnCloseRequests').addEventListener('click', () => document.getElementById('requestsPanel').classList.add('hidden'));

// INIT
function initGlobal() {
    initTabs();
    const header = document.getElementById('monthSelectorContainer');
    if(!document.getElementById('monthSel')) {
        const sel = document.createElement('select'); sel.id='monthSel';
        sel.className = 'bg-[#1A1C2E] text-white text-sm font-medium px-4 py-2 rounded-lg border border-[#2E3250] outline-none cursor-pointer shadow-lg';
        availableMonths.forEach(m => {
            const opt = document.createElement('option'); opt.value = `${m.year}-${m.month}`;
            opt.textContent = `${monthNames[m.month]}/${m.year}`;
            if(m.month === selectedMonthObj.month && m.year === selectedMonthObj.year) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', e=>{ const [y,mo] = e.target.value.split('-').map(Number); selectedMonthObj={year:y, month:mo}; loadDataFromCloud(); });
        header.appendChild(sel);
    }
    const ds = document.getElementById('dateSlider');
    if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });
    loadDataFromCloud();
}
function initTabs() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active'); document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
        });
    });
}
document.addEventListener('DOMContentLoaded', initGlobal);
