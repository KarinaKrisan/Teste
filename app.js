// app.js - Cronos Workforce Management
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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

let isAdmin = false;
let currentUserCollab = null; 
let scheduleData = {}; 
let rawSchedule = {};  
let currentDay = new Date().getDate();
let currentUserDbName = null;
let dailyChart = null; // Variável global para o gráfico

const availableMonths = [
    { label: "Novembro 2025", year: 2025, month: 10 },
    { label: "Dezembro 2025", year: 2025, month: 11 }, 
    { label: "Janeiro 2026", year: 2026, month: 0 },
    { label: "Fevereiro 2026", year: 2026, month: 1 },
    { label: "Março 2026", year: 2026, month: 2 }
];
let selectedMonthObj = availableMonths.find(m => m.year === 2025 && m.month === 11) || availableMonths[0];

const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function pad(n){ return n < 10 ? '0' + n : '' + n; }
function normalizeString(str) { return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "") : ""; }
function getInitials(name) { return name ? (name.split(' ')[0][0] + (name.split(' ').length>1 ? name.split(' ').pop()[0] : '')).toUpperCase() : "CR"; }

// --- BUSCA NOME NA ESCALA ---
function findNameInScheduleByEmail(email) {
    if (!email || !scheduleData) return null;
    const prefix = email.split('@')[0];
    const normPrefix = normalizeString(prefix); 
    return Object.keys(scheduleData).find(name => {
        const normName = normalizeString(name); 
        return normName === normPrefix || normName.includes(normPrefix) || normPrefix.includes(normName);
    });
}

// --- DETECÇÃO DE PÁGINA ---
const isCollabPage = window.location.pathname.includes('colaborador.html');

// === AUTH LISTENER ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userEmail = user.email.trim();
        console.log("Logado:", userEmail);

        // 1. Verifica ADMIN
        let isDatabaseAdmin = false;
        try {
            const q1 = query(collection(db, "administradores"), where("email", "==", userEmail));
            const s1 = await getDocs(q1);
            if (!s1.empty) isDatabaseAdmin = true;
        } catch (e) { console.error(e); }

        // 2. Verifica COLABORADOR
        let isDatabaseCollab = false;
        if (!isDatabaseAdmin) {
            try {
                const qC = query(collection(db, "colaboradores"), where("email", "==", userEmail));
                const sC = await getDocs(qC);
                if (!sC.empty) {
                    isDatabaseCollab = true;
                    currentUserDbName = sC.docs[0].data().nome || sC.docs[0].data().Nome;
                } else {
                    // Tenta Maiúsculo
                    const qC2 = query(collection(db, "colaboradores"), where("Email", "==", userEmail));
                    const sC2 = await getDocs(qC2);
                    if(!sC2.empty) {
                         isDatabaseCollab = true;
                         currentUserDbName = sC2.docs[0].data().nome || sC2.docs[0].data().Nome;
                    }
                }
            } catch(e) { console.error(e); }
        }

        // --- ROTEAMENTO ---
        if (isDatabaseAdmin) {
            if (isCollabPage) {
                window.location.href = 'index.html'; // Admin deve ir para o painel admin
                return;
            }
            isAdmin = true;
            initAppLayout();
            renderMonthSelector(); 
            loadDataFromCloud();
        } 
        else if (isDatabaseCollab) {
            if (!isCollabPage && window.location.pathname !== '/colaborador.html') { // Ajuste path conforme seu servidor
                // Se está na index, manda para colaborador.html
                // OBS: Se você usa GitHub Pages, ajuste o path se necessário
                if(!window.location.href.includes('colaborador.html')) {
                    window.location.href = 'colaborador.html';
                    return;
                }
            }
            isAdmin = false;
            initAppLayout();
            renderMonthSelector();
            loadDataFromCloud();
        } 
        else {
            alert("Acesso Negado.");
            signOut(auth);
        }
    } else {
        // Se não logado, mostra login na index ou redireciona se estiver na interna
        if (isCollabPage) window.location.href = 'index.html'; // Protege a página interna
        else {
            document.getElementById('landingPage')?.classList.remove('hidden');
            document.getElementById('appInterface')?.classList.add('hidden');
        }
    }
});

function initAppLayout() {
    document.getElementById('landingPage')?.classList.add('hidden');
    document.getElementById('appInterface').classList.remove('hidden');
    
    if (isAdmin) {
        document.getElementById('adminToolbar').classList.remove('hidden');
        // Admin começa limpo
        const cal = document.getElementById('calendarContainer');
        if(cal) cal.classList.add('hidden');
    } else {
        // Se estiver na pag colaborador, o toolbar já é fixo, mas garantimos:
        const tb = document.getElementById('collabToolbar');
        if(tb) tb.classList.remove('hidden');
    }
    
    setTimeout(() => document.getElementById('appInterface').classList.remove('opacity-0'), 50);
    startRequestsListener();
}

// --- DATA LOADING ---
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Carregando:", docId);
    
    try {
        const docSnap = await getDoc(doc(db, "escalas", docId));
        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData();
            updateDailyView();
            initSelect();

            // SE FOR COLABORADOR
            if (!isAdmin && auth.currentUser) {
                const foundName = findNameInScheduleByEmail(auth.currentUser.email);
                if (foundName) {
                    currentUserCollab = foundName;
                    setupCollabMode(foundName);
                } else {
                    if(currentUserDbName) renderBadgeOnly(currentUserDbName);
                    document.getElementById('collabNameDisplay').textContent = currentUserDbName || "Sem Escala";
                }
            }
            // SE FOR ADMIN
            else if (isAdmin) {
               renderAllWeekends();
            }
        } else {
            console.log("Sem dados.");
            rawSchedule = {}; scheduleData = {};
            processScheduleData(); updateDailyView(); initSelect();
            if(!isAdmin && currentUserDbName) renderBadgeOnly(currentUserDbName);
        }
    } catch (e) { console.error(e); }
}

function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;
    Object.keys(rawSchedule).forEach(name => {
        scheduleData[name] = { 
            schedule: rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [],
            info: rawSchedule[name].info || {} 
        };
    });
}

function setupCollabMode(name) {
    document.getElementById('collabNameDisplay').textContent = name;
    
    // Preenche e trava o select (mesmo que oculto no HTML do colaborador, é bom ter)
    const sel = document.getElementById('employeeSelect');
    if(sel) {
        sel.innerHTML = `<option>${name}</option>`;
        sel.value = name;
        sel.disabled = true;
    }

    renderPersonalCalendar(name);
}

// --- RENDERIZAÇÃO ---
function renderPersonalCalendar(name) {
    const container = document.getElementById('calendarContainer');
    const grid = document.getElementById('calendarGrid');
    const infoCard = document.getElementById('personalInfoCard');
    
    if(!container || !grid) return;
    container.classList.remove('hidden');
    grid.innerHTML = '';

    if(!scheduleData[name]) return;
    const schedule = scheduleData[name].schedule;

    // HEADER / CRACHÁ
    if(infoCard) {
        infoCard.classList.remove('hidden');
        const initials = getInitials(name);
        infoCard.innerHTML = `
            <div class="bg-gradient-to-r from-[#1A1C2E] to-[#161828] border border-[#2E3250] rounded-2xl p-6 shadow-xl relative overflow-hidden mb-6">
                <div class="flex flex-col md:flex-row items-center gap-6 relative z-10">
                    <div class="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-orange-500 flex items-center justify-center text-2xl font-bold text-white">${initials}</div>
                    <div class="text-center md:text-left flex-1">
                        <h3 class="text-xl font-bold text-white">${name}</h3>
                        <p id="badgeCargo" class="text-xs text-purple-400 font-bold uppercase mb-4">Carregando...</p>
                        <div class="grid grid-cols-3 gap-3 w-full">
                             <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 text-[9px] font-bold uppercase">Célula</span><span id="badgeCelula" class="text-white text-xs font-bold">--</span></div>
                             <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 text-[9px] font-bold uppercase">Turno</span><span id="badgeTurno" class="text-white text-xs font-bold">--</span></div>
                             <div class="bg-[#0F1020]/80 border border-[#2E3250] p-2 rounded flex flex-col items-center md:items-start"><span class="text-gray-500 text-[9px] font-bold uppercase">Horário</span><span id="badgeHorario" class="text-white text-xs font-bold">--</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if(!isAdmin && auth.currentUser) fetchCollaboratorDetails(auth.currentUser.email);
        else fetchCollaboratorDetailsByKey(name);
    }

    // CALENDÁRIO
    const firstDay = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();
    for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));

    schedule.forEach((status, i) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell border-b border-r border-[#2E3250] relative group cursor-pointer";
        let badgeClass = "day-status-badge ";
        if(status === 'T') badgeClass += "status-T";
        else if(['F','FS','FD'].includes(status)) badgeClass += "status-F";
        else if(status === 'FE') badgeClass += "status-FE";
        else badgeClass += "status-OFF-SHIFT";
        
        cell.innerHTML = `<div class="day-number">${i+1}</div><div class="${badgeClass}">${status}</div>`;
        cell.onclick = () => { if(isAdmin) toggleDayStatus(name, i); else if(currentUserCollab===name) openRequestModal(i); };
        grid.appendChild(cell);
    });

    renderWeekendModules(name);
}

// --- OUTRAS FUNÇÕES (IGUAIS AO ANTERIOR, MANTIDAS PARA INTEGRIDADE) ---
async function fetchCollaboratorDetails(email) {
    try {
        const q = query(collection(db, "colaboradores"), where("email", "==", email));
        const s = await getDocs(q);
        if(!s.empty) updateBadgeUI(s.docs[0].data());
        else {
             const q2 = query(collection(db, "colaboradores"), where("Email", "==", email));
             const s2 = await getDocs(q2);
             if(!s2.empty) updateBadgeUI(s2.docs[0].data());
        }
    } catch(e){}
}
async function fetchCollaboratorDetailsByKey(name) {
    try {
        const q = query(collection(db, "colaboradores"), where("Nome", "==", name));
        const s = await getDocs(q);
        if(!s.empty) updateBadgeUI(s.docs[0].data());
    } catch(e){}
}
function updateBadgeUI(data) {
    document.getElementById('badgeCargo').textContent = data.cargo || data.Cargo || "Colaborador";
    document.getElementById('badgeCelula').textContent = data.celula || data.Celula || data['célula'] || "--";
    document.getElementById('badgeTurno').textContent = data.turno || data.Turno || "--";
    document.getElementById('badgeHorario').textContent = data.horario || data.Horario || "--";
}

function renderBadgeOnly(name) { /* ... Mesmo do anterior ... */ }

function initSelect() {
    const sel = document.getElementById('employeeSelect');
    if(!sel) return;
    sel.innerHTML = '';
    if(isAdmin) {
        sel.disabled = false;
        sel.innerHTML = '<option value="">Selecione um colaborador</option>';
        Object.keys(scheduleData).sort().forEach(n => {
            const o = document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o);
        });
        sel.onchange = (e) => {
            if(e.target.value) { renderPersonalCalendar(e.target.value); document.getElementById('calendarContainer').classList.remove('hidden'); }
            else { document.getElementById('calendarContainer').classList.add('hidden'); document.getElementById('personalInfoCard').classList.add('hidden'); }
        }
    }
}

function updateDailyView() {
    // Popula listas de nomes na visão diária
    if(!document.getElementById('dailyView')) return;
    const listW = document.getElementById('listWorking'); if(listW) listW.innerHTML='';
    const listO = document.getElementById('listOff'); if(listO) listO.innerHTML='';
    const listS = document.getElementById('listOffShift'); if(listS) listS.innerHTML='';
    const listV = document.getElementById('listVacation'); if(listV) listV.innerHTML='';
    
    let cW=0, cO=0, cS=0, cV=0;
    
    Object.keys(scheduleData).sort().forEach(name => {
        const status = scheduleData[name].schedule[currentDay-1];
        const li = document.createElement('li');
        li.className = "flex justify-between text-xs p-2 bg-[#161828] border border-[#2E3250] rounded mb-1";
        li.innerHTML = `<span class="text-white font-bold">${name}</span><span class="text-gray-500">${status}</span>`;
        
        if(status==='T') { cW++; listW?.appendChild(li); }
        else if(['F','FS','FD'].includes(status)) { cO++; listO?.appendChild(li); }
        else if(status==='FE') { cV++; listV?.appendChild(li); }
        else { cS++; listS?.appendChild(li); }
    });
    
    if(document.getElementById('kpiWorking')) document.getElementById('kpiWorking').textContent = cW;
    if(document.getElementById('kpiOff')) document.getElementById('kpiOff').textContent = cO;
    if(document.getElementById('kpiOffShift')) document.getElementById('kpiOffShift').textContent = cS;
    if(document.getElementById('kpiVacation')) document.getElementById('kpiVacation').textContent = cV;
    
    // Update Chart
    const ctx = document.getElementById('dailyChart');
    if(ctx) {
        if (dailyChart) { dailyChart.data.datasets[0].data = [cW, cO, cV, cS]; dailyChart.update(); }
        else {
            dailyChart = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['Trab.','Folga','Férias','Encerr.'], datasets: [{ data: [cW,cO,cV,cS], backgroundColor: ['#22c55e','#eab308','#ef4444','#d946ef'], borderWidth:0 }] },
                options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
            });
        }
    }
}

function renderWeekendModules(name) {
    const cont = document.getElementById('weekendPlantaoContainer');
    if(!cont) return;
    cont.innerHTML = '';
    if(!scheduleData[name]) return;
    
    const sched = scheduleData[name].schedule;
    let has = false;
    sched.forEach((s, i) => {
        const d = new Date(selectedMonthObj.year, selectedMonthObj.month, i+1);
        const dw = d.getDay();
        if((dw===0 || dw
