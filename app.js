// app.js - Cosmic Dark Edition (Rounded) - Admin Logic
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { initAdminRequestPanel } from './admin-requests.js';

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
let hasUnsavedChanges = false;
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let isTrendMode = false;
let currentDay = new Date().getDate();

// Datas
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 
const availableMonths = [
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, 
    { year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 }, 
    { year: 2026, month: 6 }, { year: 2026, month: 7 }, { year: 2026, month: 8 }, 
    { year: 2026, month: 9 }, { year: 2026, month: 10 }, { year: 2026, month: 11 }  
];
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[availableMonths.length-1];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
function pad(n){ return n < 10 ? '0' + n : '' + n; }

// --- AUTH GUARD & ADMIN LOGIC ---
const adminToolbar = document.getElementById('adminToolbar');
const btnLogout = document.getElementById('btnLogout');

if(btnLogout) btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => {
        window.location.href = "index.html"; // Volta para login
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Verifica se é REALMENTE admin antes de mostrar o painel
        const adminEmail = "seu-email-admin@cronos.com"; // Mesmo do index.html
        let serverIsAdmin = false;
        
        if (user.email === adminEmail) serverIsAdmin = true;
        else {
             try {
                const docSnap = await getDoc(doc(db, "admins", user.uid));
                if(docSnap.exists()) serverIsAdmin = true;
             } catch(e){}
        }

        if (serverIsAdmin) {
            isAdmin = true;
            adminToolbar.classList.remove('hidden');
            document.body.style.paddingBottom = "100px";
            initAdminRequestPanel(db); // Inicia módulo de aprovações
            updateDailyView();
            initSelect();
            loadDataFromCloud();
        } else {
            // Se logou mas não é admin, manda para área de colaborador
            window.location.href = "collaborator.html";
        }
    } else {
        // Se não logado, manda pro login
        window.location.href = "index.html";
    }
});

// ==========================================
// FUNÇÕES DE DADOS E UI (Mantidas iguais ao anterior, resumidas aqui)
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
    } catch (e) { console.error(e); }
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        hasUnsavedChanges = false;
        btn.innerHTML = '<i class="fas fa-check mr-2"></i> Salvo';
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
        }, 1000);
    } catch (e) {
        console.error(e);
        btn.innerHTML = 'Erro';
    }
}
if(document.getElementById('btnSaveCloud')) document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// --- Processamento de Escala (Mantido) ---
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
    const slider = document.getElementById('dateSlider');
    if (slider) {
        const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();
        slider.max = totalDays;
        document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}

// --- Gráficos e UI ---
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
    const ranges = Array.isArray(timeRange) ? timeRange : [timeRange];
    for (const r of ranges) {
        const p = parseSingleTimeRange(r);
        if (!p) continue;
        if (p.startTotal > p.endTotal) { if (curr >= p.startTotal || curr <= p.endTotal) return true; }
        else { if (curr >= p.startTotal && curr <= p.endTotal) return true; }
    }
    return false;
}

window.toggleChartMode = function() {
    isTrendMode = !isTrendMode;
    const btn = document.getElementById("btnToggleChart");
    const title = document.getElementById("chartTitle");
    if (isTrendMode) {
        if(btn) btn.textContent = "Voltar";
        if(title) title.textContent = "Tendência Mensal";
        renderMonthlyTrendChart();
    } else {
        if(btn) btn.textContent = "Ver Tendência";
        if(title) title.textContent = "Capacidade Atual";
        updateDailyView();
    }
}

const centerTextPlugin = {
    id: 'centerTextPlugin',
    beforeDraw: (chart) => {
        if (chart.config.type !== 'doughnut') return;
        const { ctx, width, height, data } = chart;
        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
        const wIdx = data.labels.findIndex(l => l.includes('Trabalhando'));
        const wCount = wIdx !== -1 ? data.datasets[0].data[wIdx] : 0;
        const pct = total > 0 ? ((wCount / total) * 100).toFixed(0) : 0;
        ctx.save();
        ctx.font = 'bolder 3rem sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${pct}%`, width/2, height/2 - 10);
        ctx.font = '600 0.7rem sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('CAPACIDADE', width/2, height/2 + 25);
        ctx.restore();
    }
};

function renderMonthlyTrendChart() {
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
    const labels = [];
    const dataPoints = [];
    const pointColors = [];
    for (let d = 1; d <= totalDays; d++) {
        let working = 0;
        let totalStaff = 0;
        Object.keys(scheduleData).forEach(name => {
            const employee = scheduleData[name];
            if(!employee.schedule) return;
            const status = employee.schedule[d-1];
            if (status === 'T') working++;
            if (status !== 'FE') totalStaff++;
        });
        const percentage = totalStaff > 0 ? ((working / totalStaff) * 100).toFixed(0) : 0;
        labels.push(d);
        dataPoints.push(percentage);
        pointColors.push(percentage < 75 ? '#F87171' : '#34D399');
    }
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
    dailyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Capacidade (%)',
                data: dataPoints,
                borderColor: '#7C3AED',
                backgroundColor: 'rgba(124, 58, 237, 0.15)',
                pointBackgroundColor: pointColors,
                pointBorderColor: '#0F1020',
                pointRadius: 4,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false }, centerTextPlugin: false },
            scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v+'%', color: '#64748B' }, grid: { color: '#2E3250' } },
                x: { ticks: { color: '#64748B' }, grid: { display: false } }
            }
        }
    });
}

function updateDailyChartDonut(working, off, offShift, vacation) {
    const labels = [`Trabalhando (${working})`, `Folga (${off})`, `Encerrado (${offShift})`, `Férias (${vacation})`];
    const rawColors = ['#34D399','#FBBF24','#E879F9','#F87171'];
    const fData=[], fLabels=[], fColors=[];
    [working, off, offShift, vacation].forEach((d,i)=>{ 
        if(d>0 || (working+off+offShift+vacation)===0){ fData.push(d); fLabels.push(labels[i]); fColors.push(rawColors[i]); }
    });
    const ctx = document.getElementById('dailyChart').getContext('2d');
    if (dailyChart && dailyChart.config.type !== 'doughnut') { dailyChart.destroy(); dailyChart = null; }
    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: fLabels, datasets:[{ data: fData, backgroundColor: fColors, borderWidth: 0, hoverOffset:5 }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '75%', 
                plugins: { legend: { position:'bottom', labels:{ padding:15, boxWidth: 8, color: '#94A3B8', font: {size: 10} } } } 
            },
            plugins: [centerTextPlugin]
        });
    } else {
        dailyChart.data.labels = fLabels;
        dailyChart.data.datasets[0].data = fData;
        dailyChart.data.datasets[0].backgroundColor = fColors;
        dailyChart.update();
    }
}

function updateDailyView() {
    if (isTrendMode) window.toggleChartMode();
    const currentDateLabel = document.getElementById('currentDateLabel');
    const dayOfWeekIndex = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === selectedMonthObj.month && now.getFullYear() === selectedMonthObj.year);
    currentDateLabel.textContent = `${daysOfWeek[dayOfWeekIndex]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}`;
    let w=0, o=0, v=0, os=0;
    let wH='', oH='', vH='', osH='';
    if (Object.keys(scheduleData).length === 0) { updateDailyChartDonut(0,0,0,0); return; }
    Object.keys(scheduleData).forEach(name=>{
        const emp = scheduleData[name];
        let status = emp.schedule[currentDay-1] || 'F';
        let display = status;
        if (status === 'FE') { v++; display='FE'; }
        else if (isToday && status === 'T') {
            if (!isWorkingTime(emp.info.Horário)) { os++; display='OFF-SHIFT'; status='F_EFFECTIVE'; }
            else w++;
        }
        else if (status === 'T') w++;
        else o++; 
        const row = `
            <li class="flex justify-between items-center text-sm p-4 rounded-xl mb-2 bg-[#1A1C2E] hover:bg-[#2E3250] border border-[#2E3250] hover:border-purple-500 transition-all cursor-default shadow-sm group">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-200 group-hover:text-white transition-colors">${name}</span>
                    <span class="text-[10px] text-gray-500 font-mono mt-0.5">${emp.info.Horário||'--'}</span>
                </div>
                <span class="day-status status-${display} rounded-lg px-2.5 py-1 text-[10px] font-bold tracking-wide shadow-none border-0 bg-opacity-10">${statusMap[display]||display}</span>
            </li>`;
        if (status==='T') wH+=row;
        else if (status==='F_EFFECTIVE') osH+=row;
        else if (['FE'].includes(status)) vH+=row;
        else oH+=row;
    });
    document.getElementById('kpiWorking').textContent = w;
    document.getElementById('kpiOffShift').textContent = os;
    document.getElementById('kpiOff').textContent = o;
    document.getElementById('kpiVacation').textContent = v;
    document.getElementById('listWorking').innerHTML = wH || '<li class="text-gray-600 text-xs text-center py-4 italic">Ninguém neste status.</li>';
    document.getElementById('listOffShift').innerHTML = osH || '<li class="text-gray-600 text-xs text-center py-4 italic">Ninguém neste status.</li>';
    document.getElementById('listOff').innerHTML = oH || '<li class="text-gray-600 text-xs text-center py-4 italic">Ninguém neste status.</li>';
    document.getElementById('listVacation').innerHTML = vH || '<li class="text-gray-600 text-xs text-center py-4 italic">Ninguém neste status.</li>';
    updateDailyChartDonut(w, o, os, v);
}

function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    Object.keys(scheduleData).sort().forEach(name=>{
        const opt = document.createElement('option'); opt.value=name; opt.textContent=name; select.appendChild(opt);
    });
    const newSelect = select.cloneNode(true);
    select.parentNode.replaceChild(newSelect, select);
    newSelect.addEventListener('change', e => {
        const name = e.target.value;
        if(name) { updatePersonalView(name); } 
        else { document.getElementById('personalInfoCard').classList.add('hidden'); document.getElementById('calendarContainer').classList.add('hidden'); }
    });
}
function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    const cargo = emp.info.Cargo || emp.info.Grupo || 'Colaborador';
    const horario = emp.info.Horário || '--:--';
    const celula = emp.info.Célula || emp.info.Celula || 'Sitelbra';
    let turno = emp.info.Turno || 'Comercial';
    let statusToday = emp.schedule[currentDay - 1] || 'F';
    let displayStatus = statusToday;
    const now = new Date();
    const isToday = (now.getDate() === currentDay && now.getMonth() === selectedMonthObj.month && now.getFullYear() === selectedMonthObj.year);
    if (isToday && statusToday === 'T' && !isWorkingTime(emp.info.Horário)) displayStatus = 'OFF-SHIFT';
    const colorClasses = { 'T': 'bg-green-500 shadow-[0_0_10px_#22c55e]', 'F': 'bg-yellow-500 shadow-[0_0_10px_#eab308]', 'FS': 'bg-sky-500 shadow-[0_0_10px_#0ea5e9]', 'FD': 'bg-indigo-500 shadow-[0_0_10px_#6366f1]', 'FE': 'bg-red-500 shadow-[0_0_10px_#ef4444]', 'OFF-SHIFT': 'bg-fuchsia-500 shadow-[0_0_10px_#d946ef]' };
    let dotClass = colorClasses[displayStatus] || 'bg-gray-500';
    card.classList.remove('hidden');
    card.className = "mb-8 bg-[#1A1C2E] rounded-xl border border-[#2E3250] overflow-hidden";
    card.innerHTML = `
        <div class="px-6 py-5 flex justify-between items-center bg-gradient-to-r from-[#1A1C2E] to-[#2E3250]/30">
            <div><h2 class="text-xl md:text-2xl font-bold text-white tracking-tight">${name}</h2><p class="text-purple-400 text-xs font-bold uppercase tracking-widest mt-1">${cargo}</p></div>
            <div class="w-3 h-3 rounded-full ${dotClass}"></div>
        </div>
        <div class="grid grid-cols-3 divide-x divide-[#2E3250] bg-[#0F1020]/50 border-t border-[#2E3250]">
            <div class="py-4 text-center"><span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Célula</span><span class="block text-sm font-bold text-gray-300 mt-1">${celula}</span></div>
            <div class="py-4 text-center"><span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Turno</span><span class="block text-sm font-bold text-gray-300 mt-1">${turno}</span></div>
            <div class="py-4 text-center"><span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Horário</span><span class="block text-sm font-bold text-gray-300 mt-1">${horario}</span></div>
        </div>`;
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}
function cycleStatus(current) { const sequence = ['T', 'F', 'FS', 'FD', 'FE']; let idx = sequence.indexOf(current); if(idx === -1) return 'T'; return sequence[(idx + 1) % sequence.length]; }
async function handleCellClick(name, dayIndex) {
    if (!isAdmin) return;
    const emp = scheduleData[name];
    const newStatus = cycleStatus(emp.schedule[dayIndex]);
    emp.schedule[dayIndex] = newStatus;
    rawSchedule[name].calculatedSchedule = emp.schedule;
    hasUnsavedChanges = true;
    const statusEl = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    if(statusEl) { statusEl.textContent = "Alterado (Não salvo)"; statusEl.className = "text-xs text-orange-400 font-bold"; }
    if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse";
    updateCalendar(name, emp.schedule);
    updateDailyView();
    const sel = document.getElementById('employeeSelect');
    updateWeekendTable(sel ? sel.value : null);
}
function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    const isMobile = window.innerWidth <= 767;
    grid.innerHTML = '';
    if(isMobile) {
        grid.className = 'space-y-2 mt-4';
        schedule.forEach((st, i) => {
            let pillClasses = "flex justify-between items-center p-3 px-4 rounded-xl border transition-all text-sm bg-[#1A1C2E] border-[#2E3250] text-gray-300";
            if(isAdmin) pillClasses += " cursor-pointer active:scale-95";
            const el = document.createElement('div'); el.className = pillClasses;
            el.innerHTML = `<span class="font-mono text-gray-500">Dia ${pad(i+1)}</span><span class="day-status status-${st}">${statusMap[st]||st}</span>`;
            if(isAdmin) el.onclick = () => handleCellClick(name, i);
            grid.appendChild(el);
        });
    } else {
        grid.className = 'calendar-grid-container';
        const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
        const empty = new Date(m.y, m.mo, 1).getDay();
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-[#1A1C2E] opacity-50"></div>');
        schedule.forEach((st, i) => {
            const cell = document.createElement('div'); cell.className = "calendar-cell relative group";
            if(isAdmin) { cell.classList.add('cursor-pointer'); cell.title = "Clique para alterar"; cell.onclick = () => handleCellClick(name, i); }
            cell.innerHTML = `<div class="day-number group-hover:text-white transition-colors">${pad(i+1)}</div><div class="day-status-badge status-${st}">${statusMap[st]||st}</div>`;
            grid.appendChild(cell);
        });
    }
}
function initGlobal() {
    initTabs();
    const header = document.getElementById('monthSelectorContainer');
    if(!document.getElementById('monthSel')) {
        const sel = document.createElement('select'); sel.id='monthSel';
        sel.className = 'bg-[#1A1C2E] text-white text-sm font-medium px-4 py-2 rounded-lg border border-[#2E3250] focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer w-full md:w-auto shadow-lg';
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
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
            if(b.dataset.tab==='personal') { const sel = document.getElementById('employeeSelect'); if(sel && sel.value) updateWeekendTable(sel.value); else updateWeekendTable(null); }
        });
    });
}
function updateWeekendTable(specificName) {
    const container = document.getElementById('weekendPlantaoContainer');
    if (!container) return;
    container.innerHTML = '';
    const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
    const total = new Date(m.y, m.mo+1, 0).getDate();
    const fmtDate = (d) => `${pad(d)}/${pad(m.mo+1)}`;
    for (let d=1; d<=total; d++){
        const dow = new Date(m.y, m.mo, d).getDay();
        if (dow === 6) { 
            const satDate = d; const sunDate = d+1 <= total ? d+1 : null;
            let satW=[], sunW=[];
            Object.keys(scheduleData).forEach(n=>{ if(scheduleData[n].schedule[satDate-1]==='T') satW.push(n); if(sunDate && scheduleData[n].schedule[sunDate-1]==='T') sunW.push(n); });
            if(satW.length || sunW.length) {
                const makeTags = (list, colorClass) => { if(!list.length) return '<span class="text-gray-600 text-xs italic">Sem escala</span>'; return list.map(name => `<span class="inline-block bg-[#0F1020] border border-${colorClass}-900 text-${colorClass}-400 px-2 py-1 rounded text-xs font-bold mr-1 mb-1 shadow-sm">${name}</span>`).join(''); };
                const satTags = makeTags(satW, 'sky'); const sunTags = makeTags(sunW, 'indigo');
                const labelSat = `Sábado ${fmtDate(satDate)}`; const labelSun = sunDate ? `Domingo ${fmtDate(sunDate)}` : 'Domingo';
                const cardHTML = `<div class="bg-[#1A1C2E] rounded-xl shadow-lg border border-[#2E3250] overflow-hidden"><div class="bg-[#2E3250]/50 p-3 flex justify-between items-center border-b border-[#2E3250]"><span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Fim de Semana</span><span class="text-xs font-mono text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30">${fmtDate(satDate)}</span></div><div class="p-4 space-y-4"><div><h4 class="text-sky-500 font-bold text-xs uppercase mb-2 flex items-center gap-2"><i class="fas fa-calendar-day"></i> ${labelSat}</h4><div class="flex flex-wrap">${satTags}</div></div>${sunDate ? `<div class="pt-3 border-t border-[#2E3250]"><h4 class="text-indigo-500 font-bold text-xs uppercase mb-2 flex items-center gap-2"><i class="fas fa-calendar-day"></i> ${labelSun}</h4><div class="flex flex-wrap">${sunTags}</div></div>` : ''}</div></div>`;
                container.insertAdjacentHTML('beforeend', cardHTML);
            }
        }
    }
}
document.addEventListener('DOMContentLoaded', initGlobal);


