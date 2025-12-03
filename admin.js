// admin.js - Lógica do Painel Administrativo Cronos
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Configuração (Mesma do app.js)
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
let employees = []; // Carregar nomes da coleção de escalas para o select

// --- Autenticação e Init ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Verifica se é admin (simples verificação de email ou custom claim na prática)
        // Aqui assumimos que se logou, é admin, pois o login.html é restrito
        initDashboard();
    } else {
        window.location.href = "login.html";
    }
});

document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    signOut(auth);
});

async function initDashboard() {
    loadEmployees(); // Pega nomes para o select
    listenToRequests(); // Ouve realtime
}

// --- Carregar Colaboradores (do documento de escala atual) ---
async function loadEmployees() {
    // Tenta pegar do mês atual (Lógica simplificada do app.js)
    const d = new Date();
    const docId = `escala-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    // Nota: Como não temos acesso direto ao "rawSchedule" aqui sem duplicar código,
    // vamos tentar pegar a coleção 'admins' ou 'users' se existir, ou ler um doc de escala.
    // Para simplificar, vamos mockar a lista ou ler uma vez se possível.
    // *Implementação Real:* Idealmente você teria uma coleção 'users'. 
    
    // Vou usar uma lista estática baseada no seu contexto ou ler do Firestore se possível
    // Para garantir funcionamento, vamos permitir digitar o nome se a lista falhar
    
    const select = document.getElementById('reqEmployee');
    // Exemplo de preenchimento (na prática viria do Firestore)
    const mockEmployees = ["Colaborador 1", "Colaborador 2", "Operador NOC"];
    mockEmployees.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
}

// --- Ouvir Solicitações (Realtime) ---
function listenToRequests() {
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderRequestsTable();
        updateKPIs();
        renderChart();
    });
}

// --- Renderização ---
function renderRequestsTable() {
    const tbody = document.getElementById('requestsTableBody');
    tbody.innerHTML = '';

    if (requests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">Nenhuma solicitação encontrada.</td></tr>';
        return;
    }

    requests.forEach(req => {
        const dateStr = req.createdAt ? new Date(req.createdAt.seconds * 1000).toLocaleString('pt-BR') : '--';
        
        let statusBadge = '';
        if(req.status === 'pending') statusBadge = '<span class="badge-pending">Pendente</span>';
        else if(req.status === 'approved') statusBadge = '<span class="badge-approved">Aprovado</span>';
        else if(req.status === 'rejected') statusBadge = '<span class="badge-rejected">Rejeitado</span>';

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
                <button onclick="window.openWhatsApp('${req.employeeName}', '${req.status}')" class="btn-icon btn-whatsapp" title="Avisar no WhatsApp"><i class="fab fa-whatsapp"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateKPIs() {
    const pending = requests.filter(r => r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'approved').length;
    const swaps = requests.filter(r => r.type === 'troca').length;

    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiApproved').textContent = approved;
    document.getElementById('kpiSwaps').textContent = swaps;
}

// --- Ações ---
window.handleRequest = async (id, action) => {
    if(!confirm(`Tem certeza que deseja ${action === 'approve' ? 'APROVAR' : 'REJEITAR'} esta solicitação?`)) return;

    try {
        const reqRef = doc(db, "requests", id);
        await updateDoc(reqRef, {
            status: action === 'approve' ? 'approved' : 'rejected',
            updatedAt: serverTimestamp(),
            adminActionBy: auth.currentUser.email
        });
        
        // Log de auditoria (opcional, pode ser outra collection)
        console.log(`Solicitação ${id} ${action} com sucesso.`);
        
        // Se for aprovado, AQUI você idealmente atualizaria a coleção 'escalas'
        // Como a estrutura é complexa, sugerimos editar manualmente no 'index.html' após aprovar aqui.
        if(action === 'approve') {
            alert("Solicitação aprovada! Lembre-se de ir até a tela de Edição de Escala para aplicar a mudança efetiva no calendário.");
        }

    } catch (e) {
        console.error("Erro ao atualizar:", e);
        alert("Erro ao processar ação.");
    }
};

window.openWhatsApp = (name, status) => {
    // Simulação de número. Na prática, você precisa ter o telefone no cadastro do usuário.
    // Aqui abrimos um template genérico.
    const text = `Olá ${name}, sua solicitação no Cronos foi atualizada para status: ${status.toUpperCase()}.`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

// --- Modal Logic ---
const modal = document.getElementById('requestModal');
window.openRequestModal = () => {
    modal.classList.add('open');
};
window.closeRequestModal = () => {
    modal.classList.remove('open');
};

document.getElementById('newRequestForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reqEmployee').value;
    const type = document.getElementById('reqType').value;
    const details = document.getElementById('reqDetails').value;

    if(!name || !details) return alert("Preencha todos os campos");

    try {
        await addDoc(collection(db, "requests"), {
            employeeName: name,
            type: type,
            details: details,
            status: 'pending',
            createdAt: serverTimestamp(),
            createdBy: 'admin' // Ou o ID do usuário se fosse o painel do user
        });
        closeRequestModal();
        document.getElementById('newRequestForm').reset();
    } catch (e) {
        console.error("Erro ao criar:", e);
        alert("Erro ao criar solicitação");
    }
});

// --- Gráfico Simples ---
function renderChart() {
    const ctx = document.getElementById('requestsChart').getContext('2d');
    const types = {};
    requests.forEach(r => { types[r.type] = (types[r.type] || 0) + 1; });

    if(window.reqChart) window.reqChart.destroy();

    window.reqChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(types),
            datasets: [{
                data: Object.values(types),
                backgroundColor: ['#7C3AED', '#F59E0B', '#10B981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } }
        }
    });
}
