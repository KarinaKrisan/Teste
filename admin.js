import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
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

let requests = [];

// Checagem de Auth
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
    loadEmployees(); 
    listenToRequests(); 
}

// Carregar nomes para o Select (Simulação baseada na sua estrutura)
async function loadEmployees() {
    const select = document.getElementById('reqEmployee');
    select.innerHTML = '<option value="">Selecione...</option>';
    
    // Tenta ler a escala atual para pegar nomes reais
    const d = new Date();
    const docId = `escala-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    
    // Lista de fallback caso a coleção não exista ainda
    const fallbackNames = ["Colaborador 1", "Colaborador 2", "Operador NOC", "Gerente"];
    
    fallbackNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

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
    document.getElementById('kpiTotalUsers').textContent = "12"; // Valor fixo ou vindo do DB
}

// Global functions para uso no HTML
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
