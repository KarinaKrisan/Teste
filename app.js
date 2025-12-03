// app.js - Cosmic Dark Edition (Rounded) - Admin Management
// =================================================================
// LÓGICA PRINCIPAL DO PAINEL ADMINISTRATIVO
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
// Importa o módulo de aprovações (certifique-se que o arquivo admin-requests.js está na pasta)
import { initAdminRequestPanel } from './admin-requests.js';

// ==========================================
// 1. CONFIGURAÇÃO FIREBASE
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
// 2. ESTADO GLOBAL
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

// Meses disponíveis para navegação
const availableMonths = [
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, 
    { year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 }, 
    { year: 2026, month: 6 }, { year: 2026, month: 7 }, { year: 2026, month: 8 }, 
    { year: 2026, month: 9 }, { year: 2026, month: 10 }, { year: 2026, month: 11 }  
];

// Seleciona o mês atual ou o último disponível
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[availableMonths.length-1];

// Mapa de Status
const statusMap = { 
    'T':'Trabalhando',
    'F':'Folga',
    'FS':'Folga Sáb',
    'FD':'Folga Dom',
    'FE':'Férias',
    'OFF-SHIFT':'Exp.Encerrado', 
    'F_EFFECTIVE': 'Exp.Encerrado' 
};
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 3. AUTENTICAÇÃO E SEGURANÇA
// ==========================================
const adminToolbar = document.getElementById('adminToolbar');
const btnLogout = document.getElementById('btnLogout');

// --- SUPER ADMIN (Hardcoded para segurança máxima) ---
const SUPREME_ADMIN = "contatokarinakrisan@gmail.com";

if(btnLogout) btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        let serverIsAdmin = false;
        const userEmail = user.email.toLowerCase();

        // 1. Verifica se é a Suprema
        if (userEmail === SUPREME_ADMIN) {
            serverIsAdmin = true;
        } else {
             // 2. Checa coleção de usuários autorizados no Firestore
             try {
                // O ID do documento em 'system_users' é o próprio email
                const docSnap = await getDoc(doc(db, "system_users", userEmail));
                if(docSnap.exists() && docSnap.data().role === 'admin') {
                    serverIsAdmin = true;
                }
             } catch(e) { 
                 console.error("Erro ao verificar admin:", e); 
             }
        }

        if (serverIsAdmin) {
            isAdmin = true;
            adminToolbar.classList.remove('hidden');
            document.body.style.paddingBottom = "100px";
            
            // Adiciona o botão de gestão de time na barra
            addTeamManagementButton();
            
            // Inicia os submódulos
            initAdminRequestPanel(db); 
            updateDailyView();
            initSelect();
            loadDataFromCloud();
        } else {
            // Se logou mas não é admin, manda para a área do colaborador
            window.location.href = "collaborator.html";
        }
    } else {
        // Se não está logado, volta para o login
        window.location.href = "index.html";
    }
});

// ==========================================
// 4. GESTÃO DE USUÁRIOS (NOVA FUNCIONALIDADE)
// ==========================================
function addTeamManagementButton() {
    const container = document.querySelector('#adminToolbar > div');
    // Evita duplicar o botão
    if(document.getElementById('btnManageTeam')) return;

    const btn = document.createElement('button');
    btn.id = 'btnManageTeam';
    btn.className = 'group bg-purple-600 hover:bg-purple-500 text-white px-3 py-2.5 rounded-xl font-bold text-sm transition-all ml-2 shadow-lg flex items-center justify-center';
    btn.innerHTML = '<i class="fas fa-users-cog"></i>';
    btn.title = "Gerenciar Acessos";
    btn.onclick = openTeamModal;
    
    // Inserir antes dos botões de salvar/sair para ficar acessível
    const actionsDiv = container.querySelector('.flex.gap-2');
    if(actionsDiv) {
        actionsDiv.insertBefore(btn, actionsDiv.firstChild);
    }

    // Cria o Modal no DOM se não existir
    createTeamModal();
}

function createTeamModal() {
    // Evita recriar o modal se já existir
    if(document.getElementById('teamModal')) return;

    const modalHTML = `
    <div id="teamModal" class="hidden fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
        <div class="bg-[#1A1C2E] border border-[#2E3250] rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden max-h-[85vh]">
            <div class="p-6 border-b border-[#2E3250] flex justify-between items-center bg-[#0F1020]/50">
                <div>
                    <h2 class="text-xl font-bold text-white">Gerenciar Acessos</h2>
                    <p class="text-xs text-gray-400">Cadastre e defina permissões de acesso ao sistema.</p>
                </div>
                <button onclick="document.getElementById('teamModal').classList.add('hidden')" class="text-gray-500 hover:text-white transition-colors"><i class="fas fa-times text-xl"></i></button>
            </div>
            
            <div class="p-6 border-b border-[#2E3250] bg-[#161828]">
                <form id="addUserForm" class="flex flex-col md:flex-row gap-3">
                    <input type="email" id="newEmail" placeholder="E-mail do colaborador" class="flex-1 bg-[#0F1020] border border-[#2E3250] rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 placeholder-gray-600" required>
                    <select id="newRole" class="bg-[#0F1020] border border-[#2E3250] rounded-lg px-4 py-2 text-white outline-none focus:border-purple-500 cursor-pointer">
                        <option value="collaborator">Colaborador</option>
                        <option value="admin">Administrador</option>
                    </select>
                    <button type="submit" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2 whitespace-nowrap">
                        <i class="fas fa-plus"></i> Adicionar
                    </button>
                </form>
            </div>

            <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="text-xs font-bold text-gray-500 uppercase border-b border-[#2E3250]">
                            <th class="pb-3 pl-2">E-mail</th>
                            <th class="pb-3">Permissão</th>
                            <th class="pb-3 text-right pr-2">Ação</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody" class="text-sm">
                        <!-- Lista Inserida via JS -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Lógica de envio do formulário de novo usuário
    document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('newEmail').value.toLowerCase().trim();
        const role = document.getElementById('newRole').value;
        const btn = e.target.querySelector('button');
        
        // Bloqueia botão durante envio
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Salva no Firestore usando o email como ID do documento
            await setDoc(doc(db, "system_users", email), {
                email: email,
                role: role,
                addedAt: new Date().toISOString(),
                addedBy: auth.currentUser.email
            });
            document.getElementById('newEmail').value = ''; // Limpa campo
            loadUsersList(); // Recarrega lista visualmente
        } catch(err) {
            console.error(err);
            alert("Erro ao adicionar usuário. Verifique sua conexão e permissões.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Adicionar';
        }
    });
}

async function openTeamModal() {
    document.getElementById('teamModal').classList.remove('hidden');
    loadUsersList();
}

async function loadUsersList() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-8 text-gray-500 flex flex-col gap-2"><i class="fas fa-circle-notch fa-spin"></i> Carregando lista...</td></tr>';

    try {
        const querySnapshot = await getDocs(collection(db, "system_users"));
        tbody.innerHTML = '';
        
        // 1. Adiciona o Admin Supremo manualmente na lista visual (para constar)
        const supremeRow = `
            <tr class="border-b border-[#2E3250]/50 hover:bg-[#2E3250]/30 transition-colors group">
                <td class="py-3 pl-2 font-mono text-purple-300 font-bold flex items-center gap-2">
                    ${SUPREME_ADMIN} 
                    <span class="text-[9px] bg-purple-900/50 px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-200">SUPREMO</span>
                </td>
                <td class="py-3"><span class="text-[10px] font-bold text-green-400 uppercase tracking-wider">Acesso Total</span></td>
                <td class="py-3 text-right pr-2 text-gray-600"><i class="fas fa-lock opacity-50"></i></td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', supremeRow);

        // 2. Adiciona usuários do banco
        if(querySnapshot.empty) {
            tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="3" class="text-center py-4 text-gray-600 italic text-xs">Nenhum outro usuário cadastrado.</td></tr>');
        }

        querySnapshot.forEach((docSnap) => {
            const u = docSnap.data();
            const isAdm = u.role === 'admin';
            
            // Define estilos baseados no cargo
            const badgeClass = isAdm 
                ? 'bg-purple-900/20 text-purple-400 border-purple-500/30' 
                : 'bg-blue-900/10 text-blue-400 border-blue-500/20';
            
            const roleLabel = isAdm ? 'Administrador' : 'Colaborador';

            const row = `
            <tr class="border-b border-[#2E3250]/50 hover:bg-[#2E3250]/30 transition-colors group">
                <td class="py-3 pl-2 text-gray-300 font-mono text-xs md:text-sm">${u.email}</td>
                <td class="py-3">
                    <span class="text-[10px] font-bold px-2 py-1 rounded border ${badgeClass} uppercase tracking-wider">
                        ${roleLabel}
                    </span>
                </td>
                <td class="py-3 text-right pr-2">
                    <button onclick="window.deleteUser('${u.email}')" class="text-gray-600 hover:text-red-400 hover:bg-red-900/20 p-2 rounded-lg transition-all" title="Remover Acesso">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>`;
            tbody.insertAdjacentHTML('beforeend', row);
        });
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-red-400 text-xs">Erro ao carregar lista de usuários.</td></tr>';
    }
}

// Torna a função global para ser acessada pelo onclick do botão na tabela
window.deleteUser = async (email) => {
    if(!confirm(`Tem certeza que deseja remover o acesso de: ${email}?`)) return;
    try {
        await deleteDoc(doc(db, "system_users", email));
        loadUsersList(); // Atualiza a tabela
    } catch(e) { 
        console.error(e);
        alert("Erro ao remover usuário."); 
    }
};


// ==========================================
// 5. FIRESTORE DATA (Carregar/Salvar Escala)
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
            console.log("Nenhum documento de escala encontrado para este mês.");
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
    } catch (e) { console.error("Erro loadData:", e); }
}

async function saveToCloud() {
    if(!isAdmin) return;
    const btn = document.getElementById('btnSaveCloud');
    
    // Feedback visual de carregamento
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> ...';
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    
    try {
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        hasUnsavedChanges = false;
        
        // Feedback de sucesso
        btn.innerHTML = '<i class="fas fa-check mr-2"></i> Salvo';
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-500');
        btn.classList.add('bg-green-600', 'hover:bg-green-500');
        
        const status = document.getElementById('saveStatus');
        if(status) {
            status.textContent = "Sincronizado";
            status.className = "text-xs text-gray-300 font-medium";
        }

        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
            btn.classList.remove('bg-green-600', 'hover:bg-green-500', 'opacity-75', 'cursor-not-allowed');
            btn.classList.add('bg-indigo-600', 'hover:bg-indigo-500');
        }, 1500);
    } catch (e) {
        console.error(e);
        btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro';
        alert("Erro ao salvar dados no servidor.");
    }
}

// Listener para o botão de salvar
if(document.getElementById('btnSaveCloud')) {
    document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);
}

// ==========================================
// 6. PROCESSAMENTO DE ESCALA
// ==========================================
function generate5x2ScheduleDefaultForMonth(monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    const arr = [];
    for (let d=1; d<=totalDays; d++){
        const dow = new Date(monthObj.year, monthObj.month, d).getDay();
        // 0=Domingo, 6=Sábado -> Folga (F), senão Trabalho (T)
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
        if (simple) { 
            for(let x=parseInt(simple[1]); x<=parseInt(simple[2]); x++) 
                if(x>=1 && x<=totalDays) days.add(x); 
            return; 
        }
        
        const number = part.match(/^(\d{1,2})$/);
        if (number) { 
            const v=parseInt(number[1]); 
            if(v>=1 && v<=totalDays) days.add(v); 
            return; 
        }
        
        if (/fins? de semana|fim de semana/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ 
                const dow = new Date(monthObj.year, monthObj.month, d).getDay(); 
                if (dow===0||dow===6) days.add(d); 
            }
            return;
        }
        
        if (/segunda a sexta/i.test(part)) {
            for (let d=1; d<=totalDays; d++){ 
                const dow = new Date(monthObj.year, monthObj.month, d).getDay(); 
                if (dow>=1 && dow<=5) days.add(d); 
            }
            return;
        }
    });
    return Array.from(days).sort((a,b)=>a-b);
}

function buildFinalScheduleForMonth(employeeData, monthObj) {
    const totalDays = new Date(monthObj.year, monthObj.month+1, 0).getDate();
    
    // Se já existe escala calculada e salva (edição manual), usa ela
    if (employeeData.calculatedSchedule && Array.isArray(employeeData.calculatedSchedule)) return employeeData.calculatedSchedule;

    const schedule = new Array(totalDays).fill(null);
    let tArr = [];
    
    // Processa dias de trabalho base
    if(typeof employeeData.T === 'string' && /segunda a sexta/i.test(employeeData.T)) {
        tArr = generate5x2ScheduleDefaultForMonth(monthObj);
    } else if(Array.isArray(employeeData.T)) {
        const arr = new Array(totalDays).fill('F');
        employeeData.T.forEach(x => { if(typeof x === 'number') arr[x-1] = 'T'; });
        tArr = arr;
    }

    // Processa exceções (Férias, Folgas)
    const vacDays = parseDayListForMonth(employeeData.FE, monthObj);
    vacDays.forEach(d => { if (d>=1 && d<=totalDays) schedule[d-1] = 'FE'; });
    
    const fsDays = parseDayListForMonth(employeeData.FS, monthObj);
    fsDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FS'; });
    
    const fdDays = parseDayListForMonth(employeeData.FD, monthObj);
    fdDays.forEach(d => { if(schedule[d-1] !== 'FE') schedule[d-1] = 'FD'; });

    // Preenche buracos
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
    
    // Configura slider
    const slider = document.getElementById('dateSlider');
    if (slider) {
        const totalDays = new Date(selectedMonthObj.year, selectedMonthObj.month+1, 0).getDate();
        slider.max = totalDays;
        document.getElementById('sliderMaxLabel').textContent = `Dia ${totalDays}`;
        if (currentDay > totalDays) currentDay = totalDays;
        slider.value = currentDay;
    }
}

// ==========================================
// 7. GRÁFICOS E INTERFACE
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

// ==========================================
// 8. ABA PESSOAL / EDITOR DE ESCALA
// ==========================================
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
    
    const colorClasses = { 
        'T': 'bg-green-500 shadow-[0_0_10px_#22c55e]', 
        'F': 'bg-yellow-500 shadow-[0_0_10px_#eab308]', 
        'FS': 'bg-sky-500 shadow-[0_0_10px_#0ea5e9]', 
        'FD': 'bg-indigo-500 shadow-[0_0_10px_#6366f1]', 
        'FE': 'bg-red-500 shadow-[0_0_10px_#ef4444]', 
        'OFF-SHIFT': 'bg-fuchsia-500 shadow-[0_0_10px_#d946ef]' 
    };
    let dotClass = colorClasses[displayStatus] || 'bg-gray-500';
    
    card.classList.remove('hidden');
    card.className = "mb-8 bg-[#1A1C2E] rounded-xl border border-[#2E3250] overflow-hidden";
    card.innerHTML = `
        <div class="px-6 py-5 flex justify-between items-center bg-gradient-to-r from-[#1A1C2E] to-[#2E3250]/30">
            <div>
                <h2 class="text-xl md:text-2xl font-bold text-white tracking-tight">${name}</h2>
                <p class="text-purple-400 text-xs font-bold uppercase tracking-widest mt-1">${cargo}</p>
            </div>
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

function cycleStatus(current) { 
    const sequence = ['T', 'F', 'FS', 'FD', 'FE']; 
    let idx = sequence.indexOf(current); 
    if(idx === -1) return 'T'; 
    return sequence[(idx + 1) % sequence.length]; 
}

// Edição de Escala (Clique no dia)
async function handleCellClick(name, dayIndex) {
    if (!isAdmin) return;
    const emp = scheduleData[name];
    const newStatus = cycleStatus(emp.schedule[dayIndex]);
    emp.schedule[dayIndex] = newStatus;
    rawSchedule[name].calculatedSchedule = emp.schedule;
    
    hasUnsavedChanges = true;
    const statusEl = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    if(statusEl) { 
        statusEl.textContent = "Alterado (Não salvo)"; 
        statusEl.className = "text-xs text-orange-400 font-bold"; 
    }
    if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse";
    
    updateCalendar(name, emp.schedule);
    updateDailyView();
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
            if(isAdmin) { 
                cell.classList.add('cursor-pointer'); 
                cell.title = "Clique para alterar"; 
                cell.onclick = () => handleCellClick(name, i); 
            }
            cell.innerHTML = `<div class="day-number group-hover:text-white transition-colors">${pad(i+1)}</div><div class="day-status-badge status-${st}">${statusMap[st]||st}</div>`;
            grid.appendChild(cell);
        });
    }
}

// ==========================================
// 9. INICIALIZAÇÃO
// ==========================================
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
        
        sel.addEventListener('change', e=>{ 
            const [y,mo] = e.target.value.split('-').map(Number); 
            selectedMonthObj={year:y, month:mo}; 
            loadDataFromCloud(); 
        });
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
            if(b.dataset.tab==='personal') { 
                const sel = document.getElementById('employeeSelect'); 
                if(sel && sel.value) updatePersonalView(sel.value); 
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);
