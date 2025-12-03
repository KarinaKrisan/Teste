import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, getDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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
let requests = [];
const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };

// --- Auth Check ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        initDashboard();
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "login.html");
});

async function initDashboard() {
    listenToRequests(); 
    loadDailySchedule(); // Nova função: Carrega a escala do dia
}

// ==========================================
// 1. VISÃO DIÁRIA LOGIC (Trazido do app.js)
// ==========================================
async function loadDailySchedule() {
    const now = new Date();
    const docId = `escala-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const currentDay = now.getDate();
    
    // Atualiza label da data
    document.getElementById('currentDateDisplay').textContent = `${String(currentDay).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    
    // Popula select de funcionários (aproveitando o fetch da escala)
    const select = document.getElementById('reqEmployee');
    select.innerHTML = '<option value="">Selecione...</option>';

    try {
        const docRef = doc(db, "escalas", docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const rawSchedule = docSnap.data();
            
            // 1. Popula Select
            Object.keys(rawSchedule).sort().forEach(name => {
                const opt = document.createElement('option');
                opt.value = name; opt.textContent = name;
                select.appendChild(opt);
            });

            // 2. Processa o Dia Atual
            processAndRenderDaily(rawSchedule, currentDay, now);
            
            // Atualiza KPI Total
            document.getElementById('kpiTotalUsers').textContent = Object.keys(rawSchedule).length;

        } else {
            console.log("Escala do mês não encontrada.");
        }
    } catch (e) {
        console.error("Erro ao carregar escala:", e);
    }
}

function processAndRenderDaily(rawSchedule, day, dateObj) {
    let w=0, os=0, o=0, v=0;
    let listW='', listOS='', listO='', listV='';

    Object.keys(rawSchedule).forEach(name => {
        const emp = rawSchedule[name];
        
        // Recalcula o array do mês (lógica simplificada do app.js)
        const scheduleArr = buildScheduleArray(emp, dateObj); 
        let status = scheduleArr[day-1] || 'F';
        let display = status;
        
        // Verifica Horário (Off-Shift)
        if (status === 'T') {
            if (!isWorkingTime(emp.Horário)) { 
                os++; display='OFF-SHIFT'; status='F_EFFECTIVE'; 
            } else {
                w++;
            }
        } else if (status === 'FE') {
            v++; display='FE';
        } else {
            o++;
        }

        // HTML do Item da Lista
        const row = `
            <li class="flex justify-between items-center text-xs p-2 rounded bg-[#0F1020] border border-[#2E3250] mb-1">
                <span class="font-bold text-gray-300 truncate w-24">${name}</span>
                <span class="text-[10px] ${getStatusColorClass(display)} px-1.5 py-0.5 rounded font-bold">${statusMap[display]||display}</span>
            </li>`;

        if (display === 'T') listW += row;
        else if (display === 'OFF-SHIFT' || status === 'F_EFFECTIVE') listOS += row;
        else if (display === 'FE') listV += row;
        else listO += row;
    });

    // Atualiza DOM
    document.getElementById('countWorking').textContent = w;
    document.getElementById('countOffShift').textContent = os;
    document.getElementById('countOff').textContent = o;
    document.getElementById('countVacation').textContent = v;

    document.getElementById('listWorking').innerHTML = listW || '<li class="text-gray-600 text-[10px] text-center italic">Vazio</li>';
    document.getElementById('listOffShift').innerHTML = listOS || '<li class="text-gray-600 text-[10px] text-center italic">Vazio</li>';
    document.getElementById('listOff').innerHTML = listO || '<li class="text-gray-600 text-[10px] text-center italic">Vazio</li>';
    document.getElementById('listVacation').innerHTML = listV || '<li class="text-gray-600 text-[10px] text-center italic">Vazio</li>';
}

// Helpers de Lógica de Escala (Simplificados do app.js)
function buildScheduleArray(empData, dateObj) {
    const totalDays = new Date(dateObj.getFullYear(), dateObj.getMonth()+1, 0).getDate();
    const schedule = new Array(totalDays).fill('F'); // Default Folga se falhar

    // 1. Gera Base (T ou F)
    let tArr = [];
    if(typeof empData.T === 'string' && /segunda a sexta/i.test(empData.T)) {
        for (let d=1; d<=totalDays; d++){
            const dow = new Date(dateObj.getFullYear(), dateObj.getMonth(), d).getDay();
            tArr.push((dow===0||dow===6) ? 'F' : 'T');
        }
    } else if(Array.isArray(empData.T)) {
        const arr = new Array(totalDays).fill('F');
        empData.T.forEach(x => { if(typeof x === 'number') arr[x-1] = 'T'; });
        tArr = arr;
    } else {
        tArr = new Array(totalDays).fill('F'); // Fallback
    }

    // 2. Aplica Exceções
    const parseList = (val) => {
        if(!val) return [];
        if(Array.isArray(val)) return val;
        // Parser simplificado para números e "1-5"
        const days = new Set();
        String(val).split(',').forEach(p => {
            p = p.trim();
            if(p.match(/^\d+$/)) days.add(parseInt(p));
            // Adicione logica de range se necessário, aqui mantemos simples para visualização rápida
        });
        return Array.from(days);
    };

    const vacDays = parseList(empData.FE);
    const fsDays = parseList(empData.FS);
    const fdDays = parseList(empData.FD);

    for(let i=0; i<totalDays; i++) {
        if(vacDays.includes(i+1)) schedule[i] = 'FE';
        else if(fsDays.includes(i+1)) schedule[i] = 'FS';
        else if(fdDays.includes(i+1)) schedule[i] = 'FD';
        else schedule[i] = tArr[i] || 'F';
    }
    return schedule;
}

function isWorkingTime(timeRange) {
    if (!timeRange || /12x36/i.test(timeRange)) return true;
    const now = new Date();
    const curr = now.getHours()*60 + now.getMinutes();
    
    // Parse range "08:00 às 18:00"
    const m = timeRange.match(/(\d{1,2}):(\d{2})\s*às\s*(\d{1,2}):(\d{2})/);
    if (!m) return true; // Se não conseguir ler, assume trabalhando para não esconder
    
    const start = parseInt(m[1])*60 + parseInt(m[2]);
    const end = parseInt(m[3])*60 + parseInt(m[4]);
    
    if (start > end) { return curr >= start || curr <= end; }
    else { return curr >= start && curr <= end; }
}

function getStatusColorClass(status) {
    if(status==='T') return 'text-green-400 bg-green-900/30';
    if(status==='OFF-SHIFT') return 'text-fuchsia-400 bg-fuchsia-900/30';
    if(status==='FE') return 'text-red-400 bg-red-900/30';
    return 'text-yellow-400 bg-yellow-900/30';
}


// ==========================================
// 2. REQUESTS LOGIC (Mantido)
// ==========================================
function listenToRequests() {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRequestsTable();
        updateKPIs();
        renderChart();
    });
}

function renderRequestsTable() {
    const tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = '';
    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhuma solicitação encontrada.</td></tr>';
        return;
    }
    requests.forEach(req => {
        const dateStr = req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleString('pt-BR') : '--';
        let statusBadge = `<span class="badge-${req.status}">${req.status}</span>`;
        if(req.status==='pending') statusBadge = '<span class="badge-pending">Pendente</span>';
        if(req.status==='approved') statusBadge = '<span class="badge-approved">Aprovado</span>';
        if(req.status==='rejected') statusBadge = '<span class="badge-rejected">Rejeitado</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-gray-400 text-xs">${dateStr}</td>
            <td class="font-bold text-white">${req.employeeName}</td>
            <td class="capitalize text-indigo-400">${req.type}</td>
            <td class="text-sm text-gray-400">${req.details}</td>
            <td>${statusBadge}</td>
            <td class="text-right space-x-1">
                ${req.status === 'pending' ? `
                <button onclick="window.handleRequest('${req.id}', 'approve')" class="btn-icon btn-approve" title="Aprovar"><i class="fas fa-check"></i></button>
                <button onclick="window.handleRequest('${req.id}', 'reject')" class="btn-icon btn-reject" title="Rejeitar"><i class="fas fa-times"></i></button>
                ` : ''}
                <button onclick="window.openWhatsApp('${req.employeeName}', '${req.status}')" class="btn-icon btn-whatsapp"><i class="fab fa-whatsapp"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateKPIs() {
    document.getElementById('kpiPending').textContent = requests.filter(r => r.status === 'pending').length;
    document.getElementById('kpiApproved').textContent = requests.filter(r => r.status === 'approved').length;
    document.getElementById('kpiSwaps').textContent = requests.filter(r => r.type === 'troca').length;
}

// Global functions
window.handleRequest = async (id, action) => {
    if(!confirm(`Deseja realmente ${action === 'approve' ? 'APROVAR' : 'REJEITAR'}?`)) return;
    try {
        await updateDoc(doc(db, "requests", id), {
            status: action === 'approve' ? 'approved' : 'rejected',
            updatedAt: serverTimestamp()
        });
        if(action === 'approve') alert("Aprovado! Vá em 'Editar Escala' para aplicar a mudança visualmente.");
    } catch (e) { alert("Erro ao atualizar."); }
};

window.openWhatsApp = (name, status) => {
    const text = `Olá ${name}, sua solicitação foi atualizada para: ${status.toUpperCase()}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
};

// Modal Logic
window.openRequestModal = () => document.getElementById('requestModal').classList.add('open');
window.closeRequestModal = () => document.getElementById('requestModal').classList.remove('open');

document.getElementById('newRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reqEmployee').value;
    const type = document.getElementById('reqType').value;
    const details = document.getElementById('reqDetails').value;
    if(!name || !details) return;
    
    await addDoc(collection(db, "requests"), {
        employeeName: name, type, details, status: 'pending', createdAt: serverTimestamp()
    });
    closeRequestModal();
    e.target.reset();
});

// Chart
function renderChart() {
    const ctx = document.getElementById('requestsChart').getContext('2d');
    const types = {};
    requests.forEach(r => { types[r.type] = (types[r.type] || 0) + 1; });
    if(window.reqChart) window.reqChart.destroy();
    window.reqChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(types),
            datasets: [{ data: Object.values(types), backgroundColor: ['#7C3AED', '#F59E0B', '#10B981'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } } }
    });
}
