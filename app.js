// app.js - Cronos Workforce Management (Versão Estável)
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
let currentUserCollab = null; // Chave da Escala (ex: "Karina Krisan")
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let currentDay = new Date().getDate();

// Configuração de Meses
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const availableMonths = [
    { label: "Novembro 2025", year: 2025, month: 10 },
    { label: "Dezembro 2025", year: 2025, month: 11 }, 
    { label: "Janeiro 2026", year: 2026, month: 0 }, 
    { label: "Fevereiro 2026", year: 2026, month: 1 }, 
    { label: "Março 2026", year: 2026, month: 2 }
];

// Define mês inicial (Tenta Dezembro/2025 por padrão)
let selectedMonthObj = availableMonths.find(m => m.year === 2025 && m.month === 11) || availableMonths[0];

function pad(n){ return n < 10 ? '0' + n : '' + n; }
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

// ==========================================
// 4. GESTÃO DE UI (INTERFACE)
// ==========================================
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

// ==========================================
// 5. AUTENTICAÇÃO E FLUXO DE CARGA
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userEmail = user.email.trim();
        console.log(`[AUTH] Usuário logado: ${userEmail}`);

        // 1. Verifica se é ADMIN
        let isDatabaseAdmin = false;
        try {
            const adminRef = doc(db, "administradores", user.uid);
            const adminSnap = await getDoc(adminRef);
            
            if (!adminSnap.exists()) {
                // Tenta por email se não achou por UID
                const q = query(collection(db, "administradores"), where("Email", "==", userEmail)); // Tenta Maiúsculo
                const snap = await getDocs(q);
                if(!snap.empty) isDatabaseAdmin = true;
                else {
                    const q2 = query(collection(db, "administradores"), where("email", "==", userEmail)); // Tenta minúsculo
                    const snap2 = await getDocs(q2);
                    if(!snap2.empty) isDatabaseAdmin = true;
                }
            } else {
                isDatabaseAdmin = true;
            }
        } catch (e) { console.error("Erro auth admin:", e); }

        if (isDatabaseAdmin) {
            console.log(">> Modo Admin Ativado");
            setAdminMode(true);
            revealApp();
            renderMonthSelector();
            loadDataFromCloud(); // Admin carrega e vê tudo
            return;
        }

        // 2. Verifica se é COLABORADOR (Apenas checa existência)
        let isDatabaseCollab = false;
        try {
            const collabRef = doc(db, "colaboradores", user.uid);
            const collabSnap = await getDoc(collabRef);
            if(collabSnap.exists()) isDatabaseCollab = true;
            else {
                // Fallback busca email
                const qC = query(collection(db, "colaboradores"), where("email", "==", userEmail));
                const snapC = await getDocs(qC);
                if(!snapC.empty) isDatabaseCollab = true;
                else {
                    const qC2 = query(collection(db, "colaboradores"), where("Email", "==", userEmail));
                    const snapC2 = await getDocs(qC2);
                    if(!snapC2.empty) isDatabaseCollab = true;
                }
            }
        } catch(e) { console.error("Erro auth collab:", e); }

        if (isDatabaseCollab) {
            console.log(">> Modo Colaborador Ativado");
            isAdmin = false;
            revealApp();
            renderMonthSelector();
            
            // IMPORTANTE: Primeiro carrega a escala, depois descobre quem é o usuário nela
            await loadDataFromCloud(); 
            return;
        }

        alert("Usuário não encontrado nas bases de dados.");
        signOut(auth);
        hideApp();

    } else {
        hideApp();
    }
});

// ==========================================
// 6. CARREGAMENTO DE DADOS (CORE)
// ==========================================
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log(`[DATA] Baixando escala: ${docId}`);
    
    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processScheduleData(); 
            
            // Se for colaborador, precisamos encontrar qual "chave" da escala pertence a ele
            if (!isAdmin && auth.currentUser) {
                resolveUserIdentity(auth.currentUser.email);
            }
            
            // Se for admin, ou se já resolveu o usuário, atualiza a tela
            updateDailyView();
            initSelect();
            
        } else {
            console.warn("[DATA] Escala não encontrada.");
            rawSchedule = {};
            scheduleData = {};
            processScheduleData();
            updateDailyView();
            initSelect();
            if(!isAdmin) setupCollabMode(null); // Limpa tela
        }
    } catch (e) {
        console.error("Erro crítico ao baixar dados:", e);
        alert("Erro de conexão ao baixar escala.");
    }
}

// FUNÇÃO CRÍTICA: DESCOBRE QUEM É O USUÁRIO NA ESCALA
function resolveUserIdentity(email) {
    if (!email || !scheduleData) return;

    // 1. Normaliza email (karina.krisan -> karinakrisan)
    const prefix = email.split('@')[0];
    const normPrefix = normalizeString(prefix);

    // 2. Varre as chaves da escala (Ex: "Karina Krisan")
    const keys = Object.keys(scheduleData);
    const match = keys.find(key => {
        const normKey = normalizeString(key);
        return normKey.includes(normPrefix) || normPrefix.includes(normKey);
    });

    if (match) {
        console.log(`[IDENTITY] Identificado: ${match}`);
        currentUserCollab = match;
        setupCollabMode(match); // Renderiza a tela do colaborador
    } else {
        console.warn(`[IDENTITY] Não encontrei escala para: ${email}`);
        currentUserCollab = null;
        setupCollabMode(null); // Mostra estado vazio
    }
}

// ==========================================
// 7. LÓGICA DE INTERFACE
// ==========================================

function setAdminMode(active) {
    isAdmin = active;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]');
    
    if(active) {
        if(adminToolbar) adminToolbar.classList.remove('hidden');
        if(collabToolbar) collabToolbar.classList.add('hidden');
        if(dailyTabBtn) dailyTabBtn.classList.remove('hidden');
        startRequestsListener();
    } else {
        if(adminToolbar) adminToolbar.classList.add('hidden');
    }
}

function setupCollabMode(name) {
    isAdmin = false;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]');
    const display = document.getElementById('collabNameDisplay');

    if(adminToolbar) adminToolbar.classList.add('hidden');
    if(collabToolbar) collabToolbar.classList.remove('hidden');
    if(dailyTabBtn) dailyTabBtn.classList.add('hidden'); // Colaborador não vê visão diária global

    if (name) {
        if(display) display.textContent = name;
        
        // Renderiza apenas a escala dele
        renderPersonalCalendar(name);
        
        // Trava o select
        const empSelect = document.getElementById('employeeSelect');
        if(empSelect) {
            empSelect.innerHTML = `<option value="${name}">${name}</option>`;
            empSelect.value = name;
            empSelect.disabled = true;
        }
        
        // Força ir para a aba pessoal
        const personalTab = document.querySelector('[data-tab="personal"]');
        if(personalTab) personalTab.click();
        
        startRequestsListener();
    } else {
        if(display) display.textContent = "Sem escala";
        const container = document.getElementById('calendarContainer');
        if(container) container.innerHTML = '<div class="p-8 text-center text-gray-500">Nenhuma escala encontrada para este mês.</div>';
    }
}

// --- RENDERIZAÇÃO DO CRACHÁ (HEADER) ---
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

    // Renderiza o Crachá
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
                        <p id="badgeCargo" class="text-xs text-purple-400 font-bold uppercase tracking-widest mb-4 bg-purple-500/10 inline-block px-2 py-1 rounded border border-purple-500/20">Carregando...</p>
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
        // Busca os dados do crachá na coleção 'colaboradores' usando o email do login
        if(!isAdmin && auth.currentUser) fetchCollaboratorDetails(auth.currentUser.email);
        else fetchCollaboratorDetailsByKey(name); // Fallback para admin visualizando
    }
    
    // Renderiza Dias
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

// Busca dados para o crachá via Email (mais seguro)
async function fetchCollaboratorDetails(email) {
    try {
        const q1 = query(collection(db, "colaboradores"), where("email", "==", email));
        const s1 = await getDocs(q1);
        let data = null;
        
        if(!s1.empty) data = s1.docs[0].data();
        else {
            const q2 = query(collection(db, "colaboradores"), where("Email", "==", email));
            const s2 = await getDocs(q2);
            if(!s2.empty) data = s2.docs[0].data();
        }

        if (data) updateBadgeUI(data);
    } catch (e) { console.error(e); }
}

// Fallback: Busca por nome (para admin)
async function fetchCollaboratorDetailsByKey(nameKey) {
    // Implementação simplificada para visualização do admin
    // Tenta buscar pelo nome da chave
    try {
        const q = query(collection(db, "colaboradores"), where("Nome", "==", nameKey)); // Tenta match exato
        const snap = await getDocs(q);
        if(!snap.empty) updateBadgeUI(snap.docs[0].data());
    } catch(e){}
}

function updateBadgeUI(data) {
    const cargo = data.Cargo || data.cargo || "Colaborador";
    const celula = data['célula'] || data.célula || data.celula || data.Celula || "Geral";
    const turno = data.Turno || data.turno || "--";
    const horario = data.Horario || data.horario || "--:--";

    document.getElementById('badgeCargo').textContent = cargo;
    document.getElementById('badgeCelula').textContent = celula;
    document.getElementById('badgeTurno').textContent = turno;
    document.getElementById('badgeHorario').textContent = horario;
}

// ==========================================
// OUTRAS FUNÇÕES DE RENDERIZAÇÃO
// ==========================================
function processScheduleData() {
    scheduleData = {};
    if (!rawSchedule) return;
    Object.keys(rawSchedule).forEach(name => {
        const scheduleArr = rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [];
        scheduleData[name] = { schedule: scheduleArr, info: rawSchedule[name].info || {} };
    });
}

function updateDailyView() {
    // Lógica simplificada para atualizar KPIs (apenas se estiver visível)
    const container = document.getElementById('dailyView');
    if(!container || container.classList.contains('hidden')) return;
    
    // ... (Código de KPI igual ao anterior) ...
    // Vou omitir aqui para focar na correção do travamento, mas mantenha o código de KPI original se precisar
}

function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;
    select.innerHTML = '';

    if (isAdmin) {
        select.disabled = false;
        select.innerHTML = '<option value="">Selecione um colaborador</option>';
        Object.keys(scheduleData).sort().forEach(name => {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            select.appendChild(opt);
        });
        select.addEventListener('change', (e) => {
            if(e.target.value) renderPersonalCalendar(e.target.value);
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
            
            // Busca colegas
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

function renderMonthSelector() {
    const container = document.getElementById('monthSelectorContainer');
    if(!container || container.innerHTML !== '') return;
    const select = document.createElement('select');
    select.className = "bg-[#1A1C2E] border border-cronos-border text-white text-sm rounded-lg block w-full p-2.5 font-bold";
    availableMonths.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = idx; opt.textContent = m.label;
        if(m.year === selectedMonthObj.year && m.month === selectedMonthObj.month) opt.selected = true;
        select.appendChild(opt);
    });
    select.addEventListener('change', e => {
        selectedMonthObj = availableMonths[e.target.value];
        rawSchedule = {}; scheduleData = {};
        loadDataFromCloud();
    });
    container.appendChild(select);
}

// ==========================================
// LÓGICA DE SOLICITAÇÕES
// ==========================================
// ... (Mantenha o código de Modal, Botões e Envio de Solicitação igual ao anterior) ...
// Para economizar espaço na resposta, assumo que você manteve essa parte.
// Se precisar dessa parte também, me avise.

// ==========================================
// BOOTSTRAP
// ==========================================
function initGlobal() {
    document.querySelectorAll('.tab-button').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tab-button').forEach(x=>x.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));
            b.classList.add('active');
            document.getElementById(`${b.dataset.tab}View`).classList.remove('hidden');
        });
    });
    loadDataFromCloud();
}

// LOGIN UTILS
const btnLoginCollab = document.getElementById('btnConfirmCollabLogin');
if(btnLoginCollab) {
    btnLoginCollab.addEventListener('click', async () => {
        const email = document.getElementById('collabEmailInput').value.trim();
        const pass = document.getElementById('collabPassInput').value;
        if(!email || !pass) return alert("Preencha tudo");
        try {
            await signInWithEmailAndPassword(auth, email, pass);
            document.getElementById('collabLoginModal').classList.add('hidden');
        } catch(e) { alert("Erro login: " + e.message); }
    });
}
// Enter Key Support
document.getElementById('collabPassInput')?.addEventListener('keypress', e => {
    if(e.key === 'Enter') document.getElementById('btnConfirmCollabLogin').click();
});

document.addEventListener('DOMContentLoaded', initGlobal);
