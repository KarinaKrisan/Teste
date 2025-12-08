import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// --- CONFIGURAÇÃO ---
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

// --- ESTADO GLOBAL ---
let isAdmin = false;
let hasUnsavedChanges = false;
let currentUserName = null;
let currentUserProfile = null; 
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

// --- CONTROLE DE UI / LOADING ---
function hideLoader() {
    const overlay = document.getElementById('appLoadingOverlay');
    if(overlay) {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 500);
    }
}
setTimeout(hideLoader, 5000); // Trava de segurança (5s)

// --- HELPER HORÁRIO ---
function isWorkingTime(timeRange) {
    if (!timeRange || typeof timeRange !== 'string') return true;
    const times = timeRange.match(/(\d{1,2}:\d{2})/g);
    if (!times || times.length < 2) return true;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = times[0].split(':').map(Number);
    const [endH, endM] = times[1].split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    if (endTotal < startTotal) return currentMinutes >= startTotal || currentMinutes < endTotal;
    else return currentMinutes >= startTotal && currentMinutes < endTotal;
}

// --- AUTH ---
const adminToolbar = document.getElementById('adminToolbar');
const notificationWrapper = document.getElementById('notificationWrapper');

document.getElementById('btnLogout').addEventListener('click', async () => { await signOut(auth); window.location.href = "start.html"; });

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('start.html') && !window.location.pathname.includes('login-')) {
            window.location.href = "start.html";
        }
        return;
    }

    try {
        // Verifica se é Admin
        const adminRef = doc(db, "administradores", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists()) {
            isAdmin = true;
            currentUserName = "Administrador";
            setupAdminUI();
            initNotificationsListener('admin');
        } else {
            // Verifica se é Colaborador
            const collabRef = doc(db, "colaboradores", user.uid);
            const collabSnap = await getDoc(collabRef);
            
            if(collabSnap.exists()) {
                isAdmin = false;
                currentUserProfile = collabSnap.data();
                currentUserName = currentUserProfile.name;
                setupCollaboratorUI(currentUserName);
                initNotificationsListener('peer');
            } else {
                console.error("ERRO: Usuário sem perfil.");
            }
        }
        notificationWrapper.classList.remove('hidden');
    } catch (e) { console.error("Erro Auth:", e); } 
    finally { 
        loadDataFromCloud(); // Carrega dados
    }
});

function setupAdminUI() {
    adminToolbar.classList.remove('hidden');
    document.getElementById('adminEditHint').classList.remove('hidden');
    document.body.style.paddingBottom = "100px";
    document.getElementById('tabDaily').classList.remove('hidden');
    document.getElementById('tabRequests').classList.add('hidden'); 
    document.getElementById('employeeSelectContainer').classList.remove('hidden');
    switchTab('daily');
}

function setupCollaboratorUI(name) {
    adminToolbar.classList.add('hidden');
    document.getElementById('adminEditHint').classList.add('hidden');
    document.getElementById('welcomeUser').textContent = `Olá, ${name}`;
    document.getElementById('welcomeUser').classList.remove('hidden');
    document.getElementById('tabDaily').classList.add('hidden');
    document.getElementById('employeeSelectContainer').classList.add('hidden');
    document.getElementById('tabPersonal').classList.remove('hidden');
    document.getElementById('tabRequests').classList.remove('hidden');
    switchTab('personal');
}

// --- DATA ---
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
        } else {
            rawSchedule = {}; // Mês sem escala ainda
        }
        
        processScheduleData(); 
        
        // Atualiza a tela
        updateDailyView();
        
        if(isAdmin) {
            initSelect(); // <--- OBRIGATÓRIO: Popula o select do Admin
            updateWeekendTable(null); // Admin vê todos os plantões
        } else if (currentUserName) {
            updatePersonalView(currentUserName); // Carrega dados do colaborador logado
            initRequestsTabListener(); 
        }
    } catch (e) { 
        console.error("Erro dados:", e); 
    }
    finally {
        hideLoader();
    }
}

// --- POPULAR DROPDOWN (CORRIGIDO) ---
function initSelect() {
    const s = document.getElementById('employeeSelect');
    if(!s) return;
    
    // Limpa opções antigas (mantém a primeira "Selecione...")
    s.innerHTML = '<option value="">Selecione um colaborador...</option>';
    
    // Pega as chaves (nomes) da escala carregada
    const names = Object.keys(scheduleData).sort();
    
    if (names.length === 0) {
        // Se não tiver ninguém na escala, avisa
        const opt = document.createElement('option');
        opt.text = "(Nenhuma escala encontrada)";
        opt.disabled = true;
        s.add(opt);
    } else {
        names.forEach(n => { 
            const opt = document.createElement('option');
            opt.value = n;
            opt.text = n;
            s.add(opt);
        });
    }
    
    // Listener de mudança
    s.onchange = (e) => {
        const selectedName = e.target.value;
        if(selectedName) {
            updatePersonalView(selectedName);
        } else {
            document.getElementById('personalInfoCard').classList.add('hidden');
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    };
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    const status = document.getElementById('saveStatus');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        hasUnsavedChanges = false;
        status.textContent = "Sincronizado";
        status.className = "text-xs text-gray-300 font-medium";
        window.onbeforeunload = null;
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
            btn.classList.remove('opacity-75', 'cursor-not-allowed');
        }, 1000);
    } catch (e) {
        alert("Erro ao salvar!");
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
    }
}
const btnSave = document.getElementById('btnSaveCloud');
if(btnSave) btnSave.addEventListener('click', saveToCloud);
window.addEventListener('beforeunload', (e) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } });

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

// --- TABS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if(btn) btn.classList.add('active');
    document.getElementById(`${tabName}View`).classList.remove('hidden');
}

window.switchSubTab = function(type) {
    const btnMap = { 'troca_dia_trabalho': 'subTabWork', 'troca_folga': 'subTabOff', 'troca_turno': 'subTabShift' };
    Object.values(btnMap).forEach(id => document.getElementById(id).classList.remove('sub-tab-active'));
    const activeBtn = document.getElementById(btnMap[type]);
    if(activeBtn) activeBtn.classList.add('sub-tab-active');
    window.activeRequestType = type; 
    document.getElementById('btnNewRequestLabel').textContent = { 'troca_dia_trabalho': 'Solicitar Troca de Dia', 'troca_folga': 'Solicitar Troca de Folga', 'troca_turno': 'Solicitar Troca de Turno' }[type];
    initRequestsTabListener();
};
window.activeRequestType = 'troca_dia_trabalho';

// Listener de Clique nas Abas (Corrigido)
document.querySelectorAll('.tab-button').forEach(b => {
    b.addEventListener('click', () => {
        // Se for admin, pode clicar em qualquer aba visível
        // Se for colaborador, bloqueia a daily
        if(!isAdmin && b.dataset.tab === 'daily') return;
        switchTab(b.dataset.tab);
    });
});

// --- VIEWS ---
function updateDailyView() {
    const dateLabel = document.getElementById('currentDateLabel');
    if(dateLabel) {
        const dow = new Date(selectedMonthObj.year, selectedMonthObj.month, currentDay).getDay();
        dateLabel.textContent = `${daysOfWeek[dow]}, ${pad(currentDay)}/${pad(selectedMonthObj.month+1)}`;
    }
    
    let w=0, o=0, v=0, os=0;
    let lists = { w:'', o:'', v:'', os:'' };
    let vacationPills = '';
    let totalVacation = 0;
    const pillBase = "w-full text-center py-2 rounded-full text-xs font-bold border shadow-sm transition-all hover:scale-[1.02] cursor-default";

    Object.keys(scheduleData).forEach(name=>{
        const emp = scheduleData[name];
        const st = emp.schedule[currentDay-1] || 'F';
        
        if(st === 'T') {
            const hours = emp.info.Horário || emp.info.Horario || emp.info.hours || '';
            if (isWorkingTime(hours)) {
                w++;
                lists.w += `<div class="${pillBase} bg-green-900/30 text-green-400 border-green-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">T</span></div>`;
            } else {
                os++;
                lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
            }
        }
        else if(st.includes('OFF')) {
            os++;
            lists.os += `<div class="${pillBase} bg-fuchsia-900/30 text-fuchsia-400 border-fuchsia-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">EXP</span></div>`;
        }
        else if(st === 'FE') {
            totalVacation++;
            vacationPills += `<div class="${pillBase} bg-red-900/30 text-red-400 border-red-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">FÉRIAS</span></div>`;
        }
        else {
            o++;
            lists.o += `<div class="${pillBase} bg-yellow-900/30 text-yellow-500 border-yellow-500/30 flex justify-between px-4"><span class="flex-1">${name}</span> <span class="bg-black/20 px-2 rounded">F</span></div>`;
        }
    });

    if(document.getElementById('kpiWorking')) {
        document.getElementById('kpiWorking').textContent=w; 
        document.getElementById('kpiOff').textContent=o;
        document.getElementById('kpiVacation').textContent = totalVacation;
        document.getElementById('kpiOffShift').textContent = os;

        document.getElementById('listWorking').innerHTML = lists.w || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém trabalhando agora.</span>';
        document.getElementById('listOffShift').innerHTML = lists.os || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém fora de expediente.</span>';
        document.getElementById('listOff').innerHTML = lists.o || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém de folga.</span>';
        document.getElementById('listVacation').innerHTML = vacationPills || '<span class="text-xs text-gray-500 italic w-full text-center py-4">Ninguém de férias hoje.</span>';
        
        updateDailyChartDonut(w, o, os, totalVacation);
    }
}

function updateDailyChartDonut(w, o, os, v) {
    const canvas = document.getElementById('dailyChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if (dailyChart && dailyChart.config.type !== 'doughnut') { dailyChart.destroy(); dailyChart = null; }
    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: ['Trabalhando','Folga','Encerrado','Férias'], datasets:[{ data: [w,o,os,v], backgroundColor: ['#34D399','#FBBF24','#E879F9','#F87171'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position:'bottom', labels: { color: '#94A3B8' } } } }
        });
    } else { dailyChart.data.datasets[0].data = [w,o,os,v]; dailyChart.update(); }
}

function updatePersonalView(name) {
    let emp = scheduleData[name] || {}; 
    let empInfo = emp.info || {};
    let empSchedule = emp.schedule || [];

    const getField = (s, k) => { for(const x of k) if(s?.[x]) return s[x]; return null; };
    const iPr = (currentUserProfile && currentUserProfile.name === name) ? currentUserProfile : {};

    const role = getField(iPr,['cargo','Cargo']) || getField(empInfo,['cargo','Cargo']) || 'Colaborador';
    const cell = getField(iPr,['celula','Celula','Célula']) || getField(empInfo,['celula','Celula','Célula']) || '--';
    const shift = getField(iPr,['turno','Turno']) || getField(empInfo,['turno','Turno']) || '--';
    const hours = getField(iPr,['horario','Horario','Horário']) || getField(empInfo,['horario','Horario','Horário']) || '--';

    const card = document.getElementById('personalInfoCard');
    if(card) {
        card.innerHTML = `
        <div class="badge-card rounded-2xl shadow-2xl p-0 bg-[#1A1C2E] border border-purple-500/20 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>
            <div class="p-6">
                <div class="flex items-center gap-5">
                    <div class="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                        <i class="fas fa-user text-2xl text-purple-300"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white tracking-tight leading-tight">${name}</h2>
                        <p class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase tracking-widest mt-1">${role}</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/5">
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500 mb-1">Célula</p><p class="text-sm font-bold text-white font-mono">${cell}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500 mb-1">Turno</p><p class="text-sm font-bold text-white font-mono">${shift}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500 mb-1">Horário</p><p class="text-sm font-bold text-white font-mono">${hours}</p></div>
                </div>
            </div>
        </div>`;
        card.classList.remove('hidden');
    }

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, empSchedule);
    
    // Se for Admin, mostra TODOS. Se for Colab, só o dele.
    if(isAdmin) updateWeekendTable(null); 
    else updateWeekendTable(name);
}

function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    grid.innerHTML = '';
    const empty = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();
    for(let i=0;i<empty;i++) grid.innerHTML+='<div class="h-20 bg-[#1A1C2E] opacity-50"></div>';
    
    if (!schedule || schedule.length === 0) {
        const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month + 1, 0).getDate();
        schedule = new Array(totalDays).fill('F'); 
    }

    schedule.forEach((st, i) => {
        grid.innerHTML += `<div onclick="handleCellClick('${name}',${i})" class="h-20 bg-[#161828] border border-[#2E3250] p-1 cursor-pointer hover:bg-[#1F2136] relative group"><span class="text-gray-500 text-xs">${i+1}</span><div class="mt-2 text-center text-xs font-bold rounded status-${st}">${st}</div></div>`;
    });
}

function updateWeekendTable(targetName) {
    const container = document.getElementById('weekendPlantaoContainer');
    if(!container) return;
    container.innerHTML = '';
    
    if(Object.keys(scheduleData).length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum plantão neste mês.</p>';
        return;
    }
    
    const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(selectedMonthObj.year, selectedMonthObj.month, d);
        if (date.getDay() === 6) { 
            const satIndex = d - 1;
            const sunIndex = d;
            const hasSunday = (d + 1) <= totalDays;
            let satWorkers = [], sunWorkers = [];

            Object.keys(scheduleData).forEach(name => {
                const s = scheduleData[name].schedule;
                if (s && s[satIndex] === 'T') satWorkers.push(name);
                if (s && hasSunday && s[sunIndex] === 'T') sunWorkers.push(name);
            });

            // Se for Admin (targetName == null), mostra SE houver workers.
            // Se for Colaborador (targetName != null), mostra SÓ SE ele estiver na lista.
            const shouldShow = targetName === null ? (satWorkers.length > 0 || sunWorkers.length > 0) : (satWorkers.includes(targetName) || sunWorkers.includes(targetName));

            if (shouldShow) {
                const satDate = `${pad(d)}/${pad(selectedMonthObj.month+1)}`;
                const sunDate = hasSunday ? `${pad(d+1)}/${pad(selectedMonthObj.month+1)}` : '-';
                container.insertAdjacentHTML('beforeend', `
                <div class="bg-[#1A1C2E] border border-cronos-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                    <div class="bg-[#0F1020] p-3 border-b border-cronos-border flex justify-between items-center"><span class="text-sky-400 font-bold text-xs uppercase tracking-wider">Fim de Semana</span></div>
                    <div class="p-4 space-y-4 flex-1">
                        <div>
                            <h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex items-center justify-between"><span class="flex items-center gap-1"><i class="fas fa-calendar-day"></i> Sábado</span><span class="text-sky-400 bg-sky-900/20 px-1.5 py-0.5 rounded border border-sky-500/20">${satDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${satWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-green-900/20 text-green-400 border border-green-500/20 ${n===targetName?'font-bold ring-1 ring-green-500':''}">${n}</span>`).join('')}</div>
                        </div>
                        ${hasSunday ? `<div>
                            <div class="pt-3 border-t border-[#2E3250]"><h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex items-center justify-between"><span class="flex items-center gap-1"><i class="fas fa-calendar-day"></i> Domingo</span><span class="text-indigo-400 bg-indigo-900/20 px-1.5 py-0.5 rounded border border-indigo-500/20">${sunDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${sunWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-indigo-900/20 text-indigo-400 border border-indigo-500/20 ${n===targetName?'font-bold ring-1 ring-indigo-500':''}">${n}</span>`).join('')}</div></div>
                        </div>` : ''}
                    </div>
                </div>`);
            }
        }
    }
    if (container.innerHTML === '') container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum plantão encontrado.</p>';
}

// --- INTERACTION & SAVING LOCAL STATE ---
window.handleCellClick = function(name, dayIndex) {
    if(isAdmin) {
        const emp = scheduleData[name];
        const next = ['T','F','FE'][(['T','F','FE'].indexOf(emp.schedule[dayIndex])+1)%3];
        emp.schedule[dayIndex] = next;
        rawSchedule[name].calculatedSchedule = emp.schedule;
        hasUnsavedChanges = true;
        document.getElementById('saveStatus').textContent = "Alterado (Não Salvo)*";
        document.getElementById('saveStatus').classList.add('text-orange-400');
        updateCalendar(name, emp.schedule);
        return;
    }
    openRequestModal(name, dayIndex);
}

function openRequestModal(name, dayIndex) {
    const d = new Date(selectedMonthObj.year, selectedMonthObj.month, dayIndex + 1);
    document.getElementById('reqDateDisplay').textContent = `${pad(d.getDate())}/${pad(d.getMonth()+1)}`;
    document.getElementById('reqDateDisplay').classList.remove('hidden');
    document.getElementById('reqDateManual').classList.add('hidden'); 
    document.getElementById('reqDateIndex').value = dayIndex;
    document.getElementById('reqEmployeeName').value = name;
    populateTargetSelect(name);
    document.getElementById('reqType').value = window.activeRequestType;
    const isShift = (window.activeRequestType === 'troca_turno');
    document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);
    document.getElementById('requestModal').classList.remove('hidden');
}

function populateTargetSelect(myName) {
    const s = document.getElementById('reqTargetEmployee');
    s.innerHTML = '<option value="">Selecione o colega...</option>';
    Object.keys(scheduleData).sort().forEach(n => { if(n !== myName) s.innerHTML += `<option value="${n}">${n}</option>`; });
}

document.getElementById('btnNewRequestDynamic').addEventListener('click', () => {
    document.getElementById('reqDateDisplay').classList.add('hidden');
    document.getElementById('reqDateManual').classList.remove('hidden');
    document.getElementById('reqDateIndex').value = ''; 
    document.getElementById('reqEmployeeName').value = currentUserName;
    populateTargetSelect(currentUserName);
    document.getElementById('reqType').value = window.activeRequestType;
    const isShift = (window.activeRequestType === 'troca_turno');
    document.getElementById('swapTargetContainer').classList.toggle('hidden', isShift);
    document.getElementById('requestModal').classList.remove('hidden');
});

document.getElementById('btnSendRequest').addEventListener('click', async () => {
    const btn = document.getElementById('btnSendRequest');
    const type = document.getElementById('reqType').value;
    const targetEmp = document.getElementById('reqTargetEmployee').value;
    let name = document.getElementById('reqEmployeeName').value;
    
    let idx = parseInt(document.getElementById('reqDateIndex').value);
    const manualDate = document.getElementById('reqDateManual').value;
    
    if (document.getElementById('reqDateDisplay').classList.contains('hidden')) {
        if (!manualDate) { alert("Selecione a data."); return; }
        const dParts = manualDate.split('-');
        idx = parseInt(dParts[2]) - 1;
        name = currentUserName;
    }

    const reason = document.getElementById('reqReason').value;
    const needsPeer = (type !== 'troca_turno');

    if(needsPeer && !targetEmp) { alert("Selecione o colega."); return; }
    if(!reason) { alert("Informe o motivo."); return; }

    btn.innerHTML = 'Enviando...'; btn.disabled = true;

    try {
        const initialStatus = needsPeer ? 'pending_peer' : 'pending_leader';
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
        alert("Enviado!");
    } catch(e) { console.error(e); alert("Erro."); }
    finally { btn.innerHTML = 'Enviar'; btn.disabled = false; }
});

// --- LISTENER DA ABA TROCAS ---
let requestsTabUnsubscribe = null;
function initRequestsTabListener() {
    if(!currentUserName) return;
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    const qSent = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("requester", "==", currentUserName));
    const qReceived = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", currentUserName));

    const renderList = (snap, containerId, isReceived) => {
        const list = document.getElementById(containerId);
        list.innerHTML = '';
        let hasItems = false;

        snap.forEach(d => {
            const r = d.data();
            if(r.type === window.activeRequestType) {
                hasItems = true;
                const statusMap = { 'pending_peer': 'Aguardando Colega', 'pending_leader': 'Aguardando Líder', 'approved': 'Aprovado', 'rejected': 'Recusado' };
                const colorMap = { 'pending_peer': 'text-yellow-500', 'pending_leader': 'text-blue-400', 'approved': 'text-green-400', 'rejected': 'text-red-400' };
                
                let btns = '';
                if(isReceived && r.status === 'pending_peer') {
                    btns = `<div class="flex gap-2 mt-2"><button onclick="window.handleRequest('${d.id}', 'peer_accept')" class="flex-1 bg-sky-600/30 text-sky-400 text-xs py-1 rounded">Aceitar</button><button onclick="window.handleRequest('${d.id}', 'reject')" class="flex-1 bg-red-600/30 text-red-400 text-xs py-1 rounded">Recusar</button></div>`;
                }

                list.innerHTML += `
                    <div class="bg-[#0F1020] p-3 rounded-lg border border-[#2E3250] mb-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <span class="text-sky-400 font-bold text-xs uppercase">${isReceived ? r.requester : 'Para: '+(r.target||'Líder')}</span>
                                <div class="text-[10px] text-gray-400">Dia ${r.dayIndex+1}</div>
                            </div>
                            <span class="text-[10px] font-bold uppercase ${colorMap[r.status]}">${statusMap[r.status]}</span>
                        </div>
                        <p class="text-xs text-gray-500 italic mt-1">"${r.reason}"</p>
                        ${btns}
                    </div>`;
            }
        });
        if(!hasItems) list.innerHTML = '<p class="text-center text-gray-600 text-sm py-4 italic">Nenhuma solicitação deste tipo.</p>';
    };

    onSnapshot(qSent, (snap) => renderList(snap, 'sentRequestsList', false));
    onSnapshot(qReceived, (snap) => renderList(snap, 'receivedRequestsList', true));
}

// Global Notification Listener
let notifUnsubscribe = null;
function initNotificationsListener(role) {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    let q;
    if (role === 'admin') q = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("status", "==", "pending_leader"));
    else q = query(collection(db, "solicitacoes"), where("monthId", "==", docId), where("target", "==", currentUserName), where("status", "==", "pending_peer"));

    if(notifUnsubscribe) notifUnsubscribe();
    notifUnsubscribe = onSnapshot(q, (snap) => {
        const c = snap.size;
        const badge = document.getElementById('globalBadge');
        if(badge) {
            badge.textContent = c;
            badge.className = c > 0 ? "absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full border border-[#0F1020]" : "hidden";
        }
        
        const list = document.getElementById('globalList');
        if(!list) return;
        list.innerHTML = '';
        if(c === 0) list.innerHTML = '<p class="text-xs text-gray-500 text-center py-4">Nada pendente.</p>';
        snap.forEach(d => {
            const r = d.data();
            list.innerHTML += `<div class="bg-[#0F1020] p-2 rounded mb-1 border border-[#2E3250]"><div class="text-xs text-sky-400 font-bold">${r.requester}</div><div class="text-[10px] text-gray-400">${r.type} • Dia ${r.dayIndex+1}</div>
            ${role === 'admin' ? 
            `<div class="flex gap-1 mt-1"><button onclick="window.handleRequest('${d.id}','leader_approve','${r.requester}',${r.dayIndex},'${r.target}')" class="text-[10px] bg-green-900/50 text-green-400 px-2 py-1 rounded">Aprovar</button><button onclick="window.handleRequest('${d.id}','reject')" class="text-[10px] bg-red-900/50 text-red-400 px-2 py-1 rounded">Recusar</button></div>` : 
            `<div class="flex gap-1 mt-1"><button onclick="window.handleRequest('${d.id}','peer_accept')" class="text-[10px] bg-sky-900/50 text-sky-400 px-2 py-1 rounded">Aceitar</button><button onclick="window.handleRequest('${d.id}','reject')" class="text-[10px] bg-red-900/50 text-red-400 px-2 py-1 rounded">Recusar</button></div>`}</div>`;
        });
    });
}

window.handleRequest = async function(reqId, action, requesterName, dayIndex, targetName) {
    const reqRef = doc(db, "solicitacoes", reqId);
    try {
        if (action === 'reject') { await updateDoc(reqRef, { status: 'rejected' }); } 
        else if (action === 'peer_accept') { await updateDoc(reqRef, { status: 'pending_leader' }); alert("Aceito! Enviado para o líder."); } 
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

function initGlobal() {
    initSelect();
    const ds = document.getElementById('dateSlider');
    if (ds) ds.addEventListener('input', e => { currentDay = parseInt(e.target.value); updateDailyView(); });
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
}
document.addEventListener('DOMContentLoaded', initGlobal);
function initSelect() { /*...*/ }
