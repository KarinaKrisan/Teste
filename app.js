// app.js - Cosmic Dark Edition (Requests Update)
// ==========================================
// 1. IMPORTAÇÕES FIREBASE (WEB SDK)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, query, where, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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
// 3. ESTADO
// ==========================================
let isAdmin = false;
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let isTrendMode = false;
let currentDay = new Date().getDate();
let currentUserSelection = ""; // Nome do colaborador selecionado no dropdown

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

// ==========================================
// 4. AUTH & UI LOGIC
// ==========================================
const adminToolbar = document.getElementById('adminToolbar');
const btnOpenLogin = document.getElementById('btnOpenLogin');
const btnLogout = document.getElementById('btnLogout');
const adminRequestsTab = document.getElementById('btnAdminRequestsTab');

if(btnLogout) btnLogout.addEventListener('click', () => {
    signOut(auth);
    window.location.reload();
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAdmin = true;
        adminToolbar.classList.remove('hidden');
        if(btnOpenLogin) btnOpenLogin.classList.add('hidden');
        document.getElementById('adminEditHint').classList.remove('hidden');
        if(adminRequestsTab) adminRequestsTab.classList.remove('hidden'); // Mostra aba de Admin
        document.body.style.paddingBottom = "100px"; 
        
        loadAdminRequests(); // Carrega solicitações para o líder
    } else {
        isAdmin = false;
        adminToolbar.classList.add('hidden');
        if(btnOpenLogin) btnOpenLogin.classList.remove('hidden');
        document.getElementById('adminEditHint').classList.add('hidden');
        if(adminRequestsTab) adminRequestsTab.classList.add('hidden');
        document.body.style.paddingBottom = "0";
    }
    updateDailyView();
    const sel = document.getElementById('employeeSelect');
    if(sel && sel.value) updatePersonalView(sel.value);
});

// ==========================================
// 5. FIRESTORE DATA
// ==========================================
async function loadDataFromCloud() {
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    try {
        const docRef = doc(db, "escalas", docId);
        
        // Listener em Tempo Real para mudanças na escala
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                rawSchedule = docSnap.data();
                processScheduleData(); 
                updateDailyView();
                // Se já tiver carregado o select, mantém a seleção
                const sel = document.getElementById('employeeSelect');
                if(sel && sel.options.length <= 1) initSelect();
                if(sel && sel.value) updatePersonalView(sel.value);
            } else {
                console.log("Nenhum documento encontrado.");
                rawSchedule = {}; 
                processScheduleData();
                updateDailyView();
            }
        });

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
        if(statusIcon) statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2"></i> Salvar';
        }, 1000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        alert("Erro ao salvar!");
        btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erro';
    }
}

document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// ==========================================
// 6. REQUESTS SYSTEM (Solicitações)
// ==========================================

// --- UI Actions ---
const btnNewReqShift = document.getElementById('btnNewReqShift');
const btnNewReqSwap = document.getElementById('btnNewReqSwap');
const modalReqShift = document.getElementById('modalReqShift');
const modalReqSwap = document.getElementById('modalReqSwap');

function toggleModal(modal, show) {
    if(show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}

// Abrir Modais
btnNewReqShift.addEventListener('click', () => {
    document.getElementById('reqShiftName').value = currentUserSelection; // Auto-preenche
    toggleModal(modalReqShift, true);
});
btnNewReqSwap.addEventListener('click', () => {
    document.getElementById('reqSwapRequester').value = currentUserSelection;
    // Popula parceiros
    const selPartner = document.getElementById('reqSwapTarget');
    selPartner.innerHTML = '<option value="">Selecione...</option>';
    Object.keys(scheduleData).sort().forEach(n => {
        if(n !== currentUserSelection) {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            selPartner.appendChild(opt);
        }
    });
    toggleModal(modalReqSwap, true);
});

// Fechar Modais (Botões Cancelar e Fundo)
document.querySelectorAll('.btn-close-modal').forEach(b => {
    b.addEventListener('click', (e) => toggleModal(e.target.closest('.fixed'), false));
});

// --- Envio de Solicitação: Alteração Simples / Troca de Turno ---
document.getElementById('formReqShift').addEventListener('submit', async (e) => {
    e.preventDefault();
    const requester = document.getElementById('reqShiftName').value;
    const date = document.getElementById('reqShiftDate').value;
    const type = document.getElementById('reqShiftType').value;
    const obs = document.getElementById('reqShiftObs').value;
    
    // Converter data input para dia do mês
    const dObj = new Date(date);
    const day = dObj.getDate() + 1; // Ajuste de fuso simples ou usar UTC
    
    // Salvar no Firestore
    try {
        await addDoc(collection(db, "requests"), {
            type: "shift_change",
            requester: requester,
            targetDate: date,
            day: day, // Dia numérico para referência
            month: selectedMonthObj.month,
            year: selectedMonthObj.year,
            shiftType: type, // "folga" ou "troca_turno"
            obs: obs,
            status: "pending_leader", // Vai direto para o líder
            createdAt: new Date().toISOString()
        });
        alert("Solicitação enviada para aprovação do líder!");
        toggleModal(modalReqShift, false);
    } catch (err) {
        console.error(err);
        alert("Erro ao enviar solicitação.");
    }
});

// --- Envio de Solicitação: Troca com Parceiro ---
document.getElementById('formReqSwap').addEventListener('submit', async (e) => {
    e.preventDefault();
    const requester = document.getElementById('reqSwapRequester').value;
    const targetUser = document.getElementById('reqSwapTarget').value;
    const date = document.getElementById('reqSwapDate').value;
    const obs = document.getElementById('reqSwapObs').value;

    try {
        await addDoc(collection(db, "requests"), {
            type: "partner_swap",
            requester: requester,
            targetUser: targetUser,
            targetDate: date,
            month: selectedMonthObj.month,
            year: selectedMonthObj.year,
            obs: obs,
            status: "pending_partner", // Primeiro para o parceiro (Gabriel)
            createdAt: new Date().toISOString()
        });
        alert(`Solicitação enviada para ${targetUser}. Assim que ele aceitar, irá para o líder.`);
        toggleModal(modalReqSwap, false);
    } catch (err) {
        console.error(err);
        alert("Erro ao enviar solicitação.");
    }
});

// --- Carregar Solicitações do Colaborador (Painel Pessoal) ---
function loadCollaboratorRequests(name) {
    const listMyReq = document.getElementById('listMyRequests');
    const listPending = document.getElementById('listPendingApprovals');
    
    if(!name) return;

    // 1. Minhas Solicitações (Eu pedi)
    const q1 = query(collection(db, "requests"), where("requester", "==", name), orderBy("createdAt", "desc"));
    onSnapshot(q1, (snap) => {
        listMyReq.innerHTML = '';
        if(snap.empty) { listMyReq.innerHTML = '<p class="text-gray-500 text-xs italic">Nenhuma solicitação recente.</p>'; return; }
        
        snap.forEach(d => {
            const data = d.data();
            const dateFmt = data.targetDate ? data.targetDate.split('-').reverse().join('/') : 'N/A';
            let statusText = '';
            let statusClass = '';

            if(data.status === 'pending_partner') { statusText = 'Aguardando Parceiro'; statusClass = 'req-pending_partner'; }
            else if(data.status === 'pending_leader') { statusText = 'Aguardando Líder'; statusClass = 'req-pending_leader'; }
            else if(data.status === 'approved') { statusText = 'Aprovado'; statusClass = 'req-approved'; }
            else { statusText = 'Recusado'; statusClass = 'req-rejected'; }

            const desc = data.type === 'partner_swap' ? `Troca com ${data.targetUser}` : `Alteração (${data.shiftType})`;

            listMyReq.innerHTML += `
                <div class="bg-[#0F1020] p-3 rounded border border-[#2E3250] mb-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="text-gray-300 font-bold text-xs">${desc}</p>
                            <p class="text-gray-500 text-[10px]">${dateFmt}</p>
                        </div>
                        <span class="req-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
            `;
        });
    });

    // 2. Aprovações Pendentes (Alguém pediu para trocar comigo - Ex: Gabriel vendo pedido da Karina)
    const q2 = query(collection(db, "requests"), where("targetUser", "==", name), where("status", "==", "pending_partner"));
    onSnapshot(q2, (snap) => {
        listPending.innerHTML = '';
        const badge = document.getElementById('pendingCountBadge');
        if(badge) badge.classList.add('hidden');

        if(snap.empty) { listPending.innerHTML = '<p class="text-gray-500 text-xs italic">Nenhuma aprovação pendente.</p>'; return; }
        
        if(badge) {
            badge.textContent = snap.size;
            badge.classList.remove('hidden');
        }

        snap.forEach(d => {
            const data = d.data();
            const id = d.id;
            const dateFmt = data.targetDate.split('-').reverse().join('/');
            
            listPending.innerHTML += `
                <div class="bg-[#1A1C2E] p-3 rounded border border-yellow-500/30 mb-2 relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 bg-yellow-500"></div>
                    <p class="text-gray-200 text-sm font-bold mb-1">${data.requester} quer trocar com você.</p>
                    <p class="text-gray-400 text-xs mb-2">Dia: <span class="text-white">${dateFmt}</span>. Motivo: ${data.obs || 'N/A'}</p>
                    <div class="flex gap-2">
                        <button onclick="approveRequestPartner('${id}')" class="flex-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50 rounded py-1 text-xs font-bold transition-colors">Aceitar</button>
                        <button onclick="rejectRequest('${id}')" class="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded py-1 text-xs font-bold transition-colors">Recusar</button>
                    </div>
                </div>
            `;
        });
    });
}

// --- Funções Globais de Ação (Partner) ---
window.approveRequestPartner = async (id) => {
    if(!confirm("Aceitar a troca? Isso enviará o pedido para aprovação final do líder.")) return;
    await updateDoc(doc(db, "requests", id), { status: "pending_leader" });
};

window.rejectRequest = async (id) => {
    if(!confirm("Recusar solicitação?")) return;
    await updateDoc(doc(db, "requests", id), { status: "rejected" });
};

// --- Área do Admin (Líder) ---
function loadAdminRequests() {
    const container = document.getElementById('adminRequestsList');
    if(!container) return;

    const q = query(collection(db, "requests"), where("status", "==", "pending_leader"), orderBy("createdAt", "asc"));
    
    onSnapshot(q, (snap) => {
        container.innerHTML = '';
        if(snap.empty) { container.innerHTML = '<div class="text-center text-gray-500 py-10">Tudo limpo! Nenhuma solicitação pendente.</div>'; return; }

        snap.forEach(d => {
            const data = d.data();
            const id = d.id;
            const dateFmt = data.targetDate ? data.targetDate.split('-').reverse().join('/') : 'N/A';
            
            let title = "";
            let details = "";
            
            if(data.type === 'partner_swap') {
                title = `Troca: ${data.requester} ⇄ ${data.targetUser}`;
                details = `<span class="text-green-400 font-bold">Aceito por ${data.targetUser}</span>. Aguardando Líder.`;
            } else {
                title = `Alteração: ${data.requester}`;
                details = `Tipo: <span class="text-white capitalize">${data.shiftType}</span>.`;
            }

            container.innerHTML += `
                <div class="bg-[#1A1C2E] border border-[#2E3250] rounded-xl p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/30">PENDENTE LÍDER</span>
                            <span class="text-gray-500 text-xs">${dateFmt}</span>
                        </div>
                        <h4 class="text-white font-bold text-lg">${title}</h4>
                        <p class="text-gray-400 text-sm mt-1">${details}</p>
                        <p class="text-gray-500 text-xs italic mt-1">Obs: ${data.obs || '--'}</p>
                    </div>
                    <div class="flex gap-3 w-full md:w-auto">
                        <button onclick="approveRequestLeader('${id}')" class="flex-1 md:flex-none px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105">
                            <i class="fas fa-check mr-1"></i> Aprovar
                        </button>
                        <button onclick="rejectRequest('${id}')" class="flex-1 md:flex-none px-6 py-2 bg-[#0F1020] border border-red-900/50 text-red-400 hover:bg-red-900/20 font-bold rounded-lg transition-colors">
                            Recusar
                        </button>
                    </div>
                </div>
            `;
        });
    });
}

window.approveRequestLeader = async (id) => {
    // 1. Pegar dados do request
    const reqSnap = await getDoc(doc(db, "requests", id));
    if(!reqSnap.exists()) return;
    const data = reqSnap.data();

    // 2. Atualizar a Escala Real (rawSchedule)
    // Precisamos saber o dia indexado (0-30). 
    // Data input é YYYY-MM-DD.
    const dayIndex = parseInt(data.targetDate.split('-')[2]) - 1; // 0-based
    
    // Validar se estamos no mês certo
    if(data.month !== selectedMonthObj.month || data.year !== selectedMonthObj.year) {
        alert("Atenção: Esta solicitação é de um mês diferente do visualizado. Mude o mês para aplicar.");
        return;
    }

    // Lógica de Atualização da Grade
    if(data.type === 'shift_change') {
        // Ex: Solicitou Folga
        const targetStatus = data.shiftType === 'folga' ? 'F' : 'T'; // Simplificação
        if(rawSchedule[data.requester]) {
            rawSchedule[data.requester].calculatedSchedule[dayIndex] = targetStatus;
            // Opcional: Salvar Obs
        }
    } else if (data.type === 'partner_swap') {
        // Troca Simples: Inverte os status dos dois no dia
        const p1 = data.requester;
        const p2 = data.targetUser;
        if(rawSchedule[p1] && rawSchedule[p2]) {
            const s1 = rawSchedule[p1].calculatedSchedule[dayIndex];
            const s2 = rawSchedule[p2].calculatedSchedule[dayIndex];
            
            rawSchedule[p1].calculatedSchedule[dayIndex] = s2;
            rawSchedule[p2].calculatedSchedule[dayIndex] = s1;
        }
    }

    // 3. Salvar no Firestore (Escala) e Atualizar Request
    try {
        const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
        await setDoc(doc(db, "escalas", docId), rawSchedule, { merge: true });
        
        // Atualiza status do pedido
        await updateDoc(doc(db, "requests", id), { status: "approved" });
        alert("Aprovado e escala atualizada!");
    } catch(e) {
        console.error(e);
        alert("Erro ao efetivar a troca.");
    }
};

// ==========================================
// 7. DATA PROCESSING & CHART (Existente)
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

// ==========================================
// 8. CHART & UI (Mantido com melhorias)
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
        },
        plugins: [{
            id: 'targetLine',
            beforeDraw: (chart) => {
                const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                const yValue = y.getPixelForValue(75);
                if(yValue) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.strokeStyle = '#4B5563';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.moveTo(left, yValue);
                    ctx.lineTo(right, yValue);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }]
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
    if (dailyChart) {
        if (dailyChart.config.type !== 'doughnut') { dailyChart.destroy(); dailyChart = null; }
    }
    if (!dailyChart) {
        dailyChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: fLabels, datasets:[{ data: fData, backgroundColor: fColors, borderWidth: 0, hoverOffset:5 }] },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '75%', 
                plugins: { 
                    legend: { position:'bottom', labels:{ padding:15, boxWidth: 8, color: '#94A3B8', font: {size: 10} } } 
                } 
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

    if (Object.keys(scheduleData).length === 0) {
        updateDailyChartDonut(0,0,0,0);
        return;
    }

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
// 9. PERSONAL & ADMIN
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
        if(name) {
            currentUserSelection = name;
            updatePersonalView(name);
        } else {
            currentUserSelection = "";
            document.getElementById('personalInfoCard').classList.add('hidden');
            document.getElementById('collaboratorActionsPanel').classList.add('hidden');
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    });
}

function updatePersonalView(name) {
    const emp = scheduleData[name];
    if (!emp) return;
    const card = document.getElementById('personalInfoCard');
    const actionsPanel = document.getElementById('collaboratorActionsPanel');
    
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
            <div class="py-4 text-center">
                <span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Célula</span>
                <span class="block text-sm font-bold text-gray-300 mt-1">${celula}</span>
            </div>
            <div class="py-4 text-center">
                <span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Turno</span>
                <span class="block text-sm font-bold text-gray-300 mt-1">${turno}</span>
            </div>
            <div class="py-4 text-center">
                <span class="block text-[10px] text-gray-500 font-bold uppercase tracking-wider">Horário</span>
                <span class="block text-sm font-bold text-gray-300 mt-1">${horario}</span>
            </div>
        </div>
    `;

    // Show Collaborator Actions
    actionsPanel.classList.remove('hidden');
    loadCollaboratorRequests(name);

    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

function cycleStatus(current) {
    const sequence = ['T', 'F', 'FS', 'FD', 'FE'];
    let idx = sequence.indexOf(current);
    if(idx === -1) return 'T';
    return sequence[(idx + 1) % sequence.length];
}

async function handleCellClick(name, dayIndex) {
    if (!isAdmin) return;
    const emp = scheduleData[name];
    const newStatus = cycleStatus(emp.schedule[dayIndex]);
    emp.schedule[dayIndex] = newStatus;
    rawSchedule[name].calculatedSchedule = emp.schedule;
    
    // hasUnsavedChanges removido em favor do salvamento manual via botão que já atualiza o estado
    const statusEl = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('saveStatusIcon');
    if(statusEl) {
        statusEl.textContent = "Alterado (Não salvo)";
        statusEl.className = "text-xs text-orange-400 font-bold";
    }
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
            let pillClasses = "flex justify-between items-center p-3 px-4 rounded-xl border transition-all text-sm";
            if(isAdmin) pillClasses += " cursor-pointer active:scale-95";
            
            // Dark Mode Mobile Pills
            pillClasses += " bg-[#1A1C2E] border-[#2E3250] text-gray-300";

            const el = document.createElement('div');
            el.className = pillClasses;
            el.innerHTML = `
                <span class="font-mono text-gray-500">Dia ${pad(i+1)}</span>
                <span class="day-status status-${st}">${statusMap[st]||st}</span>
            `;
            if(isAdmin) el.onclick = () => handleCellClick(name, i);
            grid.appendChild(el);
        });
    } else {
        grid.className = 'calendar-grid-container';
        const m = { y: selectedMonthObj.year, mo: selectedMonthObj.month };
        const empty = new Date(m.y, m.mo, 1).getDay();
        for(let i=0;i<empty;i++) grid.insertAdjacentHTML('beforeend','<div class="calendar-cell bg-[#1A1C2E] opacity-50"></div>');
        
        schedule.forEach((st, i) => {
            const cell = document.createElement('div');
            cell.className = "calendar-cell relative group";
            
            const badge = document.createElement('div');
            badge.className = `day-status-badge status-${st}`;
            badge.textContent = statusMap[st]||st;
            
            if(isAdmin) {
                cell.classList.add('cursor-pointer');
                cell.title = "Clique para alterar";
                cell.onclick = () => handleCellClick(name, i);
            }

            cell.innerHTML = `<div class="day-number group-hover:text-white transition-colors">${pad(i+1)}</div>`;
            cell.appendChild(badge);
            grid.appendChild(cell);
        });
    }
}

// ==========================================
// 10. INIT
// ==========================================
function initGlobal() {
    initTabs();
    
    const header = document.getElementById('monthSelectorContainer');
    if(!document.getElementById('monthSel')) {
        const sel = document.createElement('select'); sel.id='monthSel';
        sel.className = 'bg-[#1A1C2E] text-white text-sm font-medium px-4 py-2 rounded-lg border border-[#2E3250] focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer w-full md:w-auto shadow-lg';
        
        availableMonths.forEach(m => {
            const opt = document.createElement('option'); 
            opt.value = `${m.year}-${m.month}`;
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
                if(sel && sel.value) updateWeekendTable(sel.value); 
                else updateWeekendTable(null);
            }
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
            const satDate = d;
            const sunDate = d+1 <= total ? d+1 : null;
            let satW=[], sunW=[];
            Object.keys(scheduleData).forEach(n=>{
                if(scheduleData[n].schedule[satDate-1]==='T') satW.push(n);
                if(sunDate && scheduleData[n].schedule[sunDate-1]==='T') sunW.push(n);
            });

            if(satW.length || sunW.length) {
                const makeTags = (list, colorClass) => {
                    if(!list.length) return '<span class="text-gray-600 text-xs italic">Sem escala</span>';
                    return list.map(name => `<span class="inline-block bg-[#0F1020] border border-${colorClass}-900 text-${colorClass}-400 px-2 py-1 rounded text-xs font-bold mr-1 mb-1 shadow-sm">${name}</span>`).join('');
                };
                const satTags = makeTags(satW, 'sky');
                const sunTags = makeTags(sunW, 'indigo');
                const labelSat = `Sábado ${fmtDate(satDate)}`;
                const labelSun = sunDate ? `Domingo ${fmtDate(sunDate)}` : 'Domingo';

                const cardHTML = `
                <div class="bg-[#1A1C2E] rounded-xl shadow-lg border border-[#2E3250] overflow-hidden">
                    <div class="bg-[#2E3250]/50 p-3 flex justify-between items-center border-b border-[#2E3250]">
                        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Fim de Semana</span>
                        <span class="text-xs font-mono text-purple-400 bg-purple-900/20 px-2 py-0.5 rounded border border-purple-500/30">${fmtDate(satDate)}</span>
                    </div>
                    <div class="p-4 space-y-4">
                        <div>
                            <h4 class="text-sky-500 font-bold text-xs uppercase mb-2 flex items-center gap-2"><i class="fas fa-calendar-day"></i> ${labelSat}</h4>
                            <div class="flex flex-wrap">${satTags}</div>
                        </div>
                        ${sunDate ? `<div class="pt-3 border-t border-[#2E3250]\">\n                            <h4 class="text-indigo-500 font-bold text-xs uppercase mb-2 flex items-center gap-2"><i class="fas fa-calendar-day"></i> ${labelSun}</h4>\n                            <div class="flex flex-wrap">${sunTags}</div></div>` : ''}
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', cardHTML);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', initGlobal);
