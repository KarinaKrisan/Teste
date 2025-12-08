// main.js - Arquivo Principal
import { db, auth, state, hideLoader, pad, availableMonths, monthNames } from './config.js';
import * as Admin from './admin-module.js';
import * as Collab from './collab-module.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// --- INICIALIZAÇÃO ---
document.getElementById('btnLogout').addEventListener('click', async () => { await signOut(auth); window.location.href = "start.html"; });

// Slider de data
const ds = document.getElementById('dateSlider');
if (ds) ds.addEventListener('input', e => { 
    state.currentDay = parseInt(e.target.value); 
    if(state.isAdmin) Admin.renderDailyView(); 
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        if (!window.location.pathname.includes('start.html') && !window.location.pathname.includes('login-')) window.location.href = "start.html";
        return;
    }
    state.currentUser = user;

    try {
        // Tenta Admin
        const adminSnap = await getDoc(doc(db, "administradores", user.uid));
        if (adminSnap.exists()) {
            state.isAdmin = true;
            await loadData(); // Carrega dados
            Admin.initAdminUI(); // Inicia UI Admin
            switchTab('daily');
        } else {
            // Tenta Colab
            const collabSnap = await getDoc(doc(db, "colaboradores", user.uid));
            if (collabSnap.exists()) {
                state.isAdmin = false;
                state.profile = collabSnap.data();
                await loadData(); // Carrega dados
                Collab.initCollabUI(); // Inicia UI Colab
                switchTab('personal');
            } else {
                alert("Usuário sem perfil!");
            }
        }
    } catch (e) { console.error(e); }
    finally { hideLoader(); }
});

// --- CARREGAMENTO DE DADOS ---
async function loadData() {
    const docId = `escala-${state.selectedMonthObj.year}-${String(state.selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const snap = await getDoc(doc(db, "escalas", docId));
        state.rawSchedule = snap.exists() ? snap.data() : {};
        processScheduleData();
        
        // Se for admin, já renderiza a daily view
        if(state.isAdmin) Admin.renderDailyView();
        
    } catch (e) { console.error("Erro loadData:", e); }
}

function processScheduleData() {
    state.scheduleData = {};
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();
    const slider = document.getElementById('dateSlider');
    if (slider) { slider.max = totalDays; slider.value = state.currentDay; }

    if(state.rawSchedule) {
        Object.keys(state.rawSchedule).forEach(name => {
            let s = state.rawSchedule[name].calculatedSchedule || new Array(totalDays).fill('F');
            state.scheduleData[name] = { info: state.rawSchedule[name], schedule: s };
        });
    }
}

// --- VISUALIZAÇÃO COMPARTILHADA (Escala Individual e Plantões) ---

// 1. Escala Individual (Crachá + Calendário)
export function updatePersonalView(name) {
    if(!name || !state.scheduleData[name]) return;
    const emp = state.scheduleData[name];
    
    // Fallbacks para dados
    const info = emp.info || {};
    const role = info.Cargo || 'Colaborador';
    const cell = info.Célula || info.Celula || '--';
    const shift = info.Turno || '--';
    const hours = info.Horário || info.Horario || '--';

    // HTML do Crachá
    document.getElementById('personalInfoCard').innerHTML = `
        <div class="badge-card rounded-2xl shadow-2xl p-0 bg-[#1A1C2E] border border-purple-500/20 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>
            <div class="p-6">
                <div class="flex items-center gap-5">
                    <div class="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                        <i class="fas fa-user text-2xl text-purple-300"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white">${name}</h2>
                        <p class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase mt-1">${role}</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/5">
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Célula</p><p class="text-sm font-bold text-white font-mono">${cell}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Turno</p><p class="text-sm font-bold text-white font-mono">${shift}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Horário</p><p class="text-sm font-bold text-white font-mono">${hours}</p></div>
                </div>
            </div>
        </div>`;
    
    document.getElementById('personalInfoCard').classList.remove('hidden');
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

export function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    const empty = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, 1).getDay();
    for(let i=0;i<empty;i++) grid.innerHTML+='<div class="h-20 bg-[#1A1C2E] opacity-50"></div>';
    
    schedule.forEach((st, i) => {
        grid.innerHTML += `
        <div onclick="window.handleCellClick('${name}',${i})" class="h-20 bg-[#161828] border border-[#2E3250] p-1 cursor-pointer hover:bg-[#1F2136] relative group">
            <span class="text-gray-500 text-xs">${i+1}</span>
            <div class="mt-2 text-center text-xs font-bold rounded status-${st}">${st}</div>
        </div>`;
    });
}

// 2. Plantão Fins de Semana
export function updateWeekendTable(targetName) {
    const container = document.getElementById('weekendPlantaoContainer');
    container.innerHTML = '';
    
    if(Object.keys(state.scheduleData).length === 0) return;
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, d);
        if (date.getDay() === 6) { 
            const satIndex = d - 1;
            const sunIndex = d;
            const hasSunday = (d + 1) <= totalDays;
            let satWorkers = [], sunWorkers = [];

            Object.keys(state.scheduleData).forEach(name => {
                const s = state.scheduleData[name].schedule;
                if (s[satIndex] === 'T') satWorkers.push(name);
                if (hasSunday && s[sunIndex] === 'T') sunWorkers.push(name);
            });

            // Lógica Crucial:
            // Se targetName for null (Admin), mostra se tiver alguém trabalhando.
            // Se targetName for nome (Colaborador), mostra só se ele estiver na lista.
            const shouldShow = targetName === null ? (satWorkers.length > 0 || sunWorkers.length > 0) : (satWorkers.includes(targetName) || sunWorkers.includes(targetName));

            if (shouldShow) {
                const satDate = `${pad(d)}/${pad(state.selectedMonthObj.month+1)}`;
                const sunDate = hasSunday ? `${pad(d+1)}/${pad(state.selectedMonthObj.month+1)}` : '-';
                
                container.insertAdjacentHTML('beforeend', `
                <div class="bg-[#1A1C2E] border border-cronos-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                    <div class="bg-[#0F1020] p-3 border-b border-cronos-border flex justify-between items-center"><span class="text-sky-400 font-bold text-xs uppercase tracking-wider">Fim de Semana</span></div>
                    <div class="p-4 space-y-4 flex-1">
                        <div>
                            <h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex justify-between"><span>Sábado</span><span class="text-sky-400">${satDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${satWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-green-900/20 text-green-400 border border-green-500/20 ${n===targetName?'font-bold ring-1 ring-green-500':''}">${n}</span>`).join('')}</div>
                        </div>
                        ${hasSunday ? `<div>
                            <div class="pt-3 border-t border-[#2E3250]"><h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex justify-between"><span>Domingo</span><span class="text-indigo-400">${sunDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${sunWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-indigo-900/20 text-indigo-400 border border-indigo-500/20 ${n===targetName?'font-bold ring-1 ring-indigo-500':''}">${n}</span>`).join('')}</div></div>
                        </div>` : ''}
                    </div>
                </div>`);
            }
        }
    }
    if (container.innerHTML === '') container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum plantão.</p>';
}

// --- UTILS ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    if(btn) btn.classList.add('active');
    document.getElementById(`${tabName}View`).classList.remove('hidden');
}

// Listeners de Aba
document.querySelectorAll('.tab-button').forEach(b => {
    b.addEventListener('click', () => {
        if(!state.isAdmin && b.dataset.tab === 'daily') return;
        switchTab(b.dataset.tab);
    });
});

// Click Handler Global (precisa estar no window para o HTML acessar)
window.handleCellClick = (name, dayIndex) => {
    if(state.isAdmin) Admin.handleAdminCellClick(name, dayIndex);
    // Collab logic can be added here if needed
};
