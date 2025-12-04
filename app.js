// app.js - Cronos Workforce Management
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
let currentUserCollab = null; 
let scheduleData = {}; 
let rawSchedule = {};  
let dailyChart = null;
let currentDay = new Date().getDate();

// Data System
const currentDateObj = new Date();
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const systemYear = currentDateObj.getFullYear();
const systemMonth = currentDateObj.getMonth(); 

const availableMonths = [
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }
];
let selectedMonthObj = availableMonths.find(m => m.year === systemYear && m.month === systemMonth) || availableMonths[0];

const statusMap = { 'T':'Trabalhando','F':'Folga','FS':'Folga Sáb','FD':'Folga Dom','FE':'Férias','OFF-SHIFT':'Exp.Encerrado', 'F_EFFECTIVE': 'Exp.Encerrado' };
const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
function pad(n){ return n < 10 ? '0' + n : '' + n; }

// ==========================================
// 4. GESTÃO DE ACESSO (Landing Page vs App)
// ==========================================
const landingPage = document.getElementById('landingPage');
const appInterface = document.getElementById('appInterface');

function revealApp() {
    landingPage.classList.add('hidden');
    appInterface.classList.remove('hidden');
    setTimeout(() => {
        appInterface.classList.remove('opacity-0');
    }, 50);
}

function hideApp() {
    appInterface.classList.add('opacity-0');
    setTimeout(() => {
        appInterface.classList.add('hidden');
        landingPage.classList.remove('hidden');
    }, 500);
}

// === AUTH LISTENER PRINCIPAL ===
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuário detectado:", user.email, "| UID:", user.uid);
        
        let isDatabaseAdmin = false;
        
        // --- 1. VERIFICAÇÃO DE ADMIN (COLEÇÃO 'administradores') ---
        // Implementada verificação tripla para garantir acesso independente de como foi cadastrado
        try {
            // A. Verifica por UID (Padrão do App - Cadastro Automático)
            const adminDocRefUid = doc(db, "administradores", user.uid);
            const adminDocSnapUid = await getDoc(adminDocRefUid);
            
            if (adminDocSnapUid.exists()) {
                isDatabaseAdmin = true;
                console.log("Admin encontrado via UID.");
            } else {
                // B. Verifica por Email como ID (Padrão de Cadastro Manual comum)
                const adminDocRefEmail = doc(db, "administradores", user.email);
                const adminDocSnapEmail = await getDoc(adminDocRefEmail);

                if (adminDocSnapEmail.exists()) {
                    isDatabaseAdmin = true;
                    console.log("Admin encontrado via E-mail (ID do Documento).");
                } else {
                    // C. Fallback: Verifica por query no campo 'email' (Padrão Auto-ID)
                    const q = query(collection(db, "administradores"), where("email", "==", user.email));
                    const querySnapshot = await getDocs(q);
                    
                    if (!querySnapshot.empty) {
                        isDatabaseAdmin = true;
                        console.log("Admin encontrado via Busca no Campo 'email'.");
                    }
                }
            }
        } catch (error) {
            console.error("Erro ao verificar admin:", error);
        }

        // Admins Supremos (Hardcoded)
        const staticAdmins = ['admin@cronos.com', 'contatokarinakrisan@gmail.com'];

        if (isDatabaseAdmin || staticAdmins.includes(user.email)) {
            console.log("Acesso concedido: ADMIN");
            setAdminMode(true);
            revealApp();
        } else {
            // --- 2. VERIFICAÇÃO DE COLABORADOR (COLEÇÃO 'colaboradores') ---
            console.log("Verificando base de colaboradores...");
            let dbName = null;

            try {
                const collabDocRef = doc(db, "colaboradores", user.uid);
                const collabSnap = await getDoc(collabDocRef);

                if (collabSnap.exists()) {
                    const data = collabSnap.data();
                    dbName = data.nome || data.name;
                    console.log("Colaborador encontrado no DB:", dbName);
                } else {
                    console.log("Colaborador não encontrado na base de dados pelo UID.");
                }
            } catch (e) {
                console.error("Erro ao buscar dados do colaborador:", e);
            }

            const finalName = dbName || resolveCollaboratorName(user.email);
            
            currentUserCollab = finalName;
            setupCollabMode(currentUserCollab);
            revealApp();
        }
    } else {
        hideApp();
    }
    updateDailyView();
});

// Função auxiliar INTELIGENTE para achar o nome na lista baseado no email
function resolveCollaboratorName(email) {
    if(!email) return "Colaborador";
    
    // 1. Extrai prefixo e prepara variações
    const prefix = email.split('@')[0].toLowerCase(); // ex: karina.krisan
    const variations = [
        prefix,                                     // karina.krisan
        prefix.replace(/\./g, ' '),                 // karina krisan
        prefix.replace(/\./g, ''),                  // karinakrisan
        prefix.replace(/\./g, '_')                  // karina_krisan
    ];

    // 2. Se temos dados de escala carregados, procuramos um match real
    if (Object.keys(scheduleData).length > 0) {
        // Percorre todas as chaves (nomes) da escala
        const matchKey = Object.keys(scheduleData).find(dbKey => {
            const normDbKey = dbKey.toLowerCase();
            const normDbKeyNoSpace = normDbKey.replace(/\s+/g, '');
            
            // Verifica se alguma variação do email bate com o nome no banco
            return variations.some(v => {
                const normVar = v.toLowerCase();
                const normVarNoSpace = normVar.replace(/\s+/g, '');
                
                return (
                    normDbKey === normVar ||                    // Match exato (normalizado)
                    normDbKeyNoSpace === normVarNoSpace ||      // Match sem espaços (karinakrisan === karinakrisan)
                    normDbKey.includes(normVar.replace(/\./g, ' ')) // Match parcial
                );
            });
        });

        if (matchKey) {
            console.log(`Nome resolvido via escala: ${email} -> ${matchKey}`);
            return matchKey; // Retorna a chave exata do objeto scheduleData
        }
    }
    
    // 3. Fallback: Formata bonito se não achar
    console.log(`Nome não encontrado na escala, usando formatação padrão para: ${prefix}`);
    return prefix.replace(/\./g, ' ').split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function setAdminMode(active) {
    isAdmin = active;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); 
    
    if(active) {
        adminToolbar.classList.remove('hidden');
        collabToolbar.classList.add('hidden'); 
        document.getElementById('adminEditHint').classList.remove('hidden');
        document.getElementById('collabEditHint').classList.add('hidden');
        document.body.style.paddingBottom = "100px";
        
        // Admin VÊ a visão diária
        if(dailyTabBtn) dailyTabBtn.classList.remove('hidden');
        
        startRequestsListener();
    } else {
        adminToolbar.classList.add('hidden');
        document.getElementById('adminEditHint').classList.add('hidden');
    }
}

function setupCollabMode(name) {
    isAdmin = false;
    const adminToolbar = document.getElementById('adminToolbar');
    const collabToolbar = document.getElementById('collabToolbar');
    const dailyTabBtn = document.querySelector('button[data-tab="daily"]'); 
    
    adminToolbar.classList.add('hidden');
    collabToolbar.classList.remove('hidden');
    
    document.getElementById('collabNameDisplay').textContent = name;
    document.getElementById('collabEditHint').classList.remove('hidden');
    document.getElementById('adminEditHint').classList.add('hidden');
    document.body.style.paddingBottom = "100px";

    // COLABORADOR NÃO VÊ A VISÃO DIÁRIA
    if(dailyTabBtn) dailyTabBtn.classList.add('hidden');

    // Auto-select na view pessoal
    const empSelect = document.getElementById('employeeSelect');
    if(empSelect) {
        // Tenta selecionar o valor exato primeiro
        empSelect.value = name;
        
        // Se falhar, tenta achar a opção correta no dropdown manualmente
        if(empSelect.selectedIndex === -1) {
             for (let i = 0; i < empSelect.options.length; i++) {
                if (empSelect.options[i].text === name) {
                    empSelect.selectedIndex = i;
                    empSelect.value = empSelect.options[i].value;
                    break;
                }
            }
        }
        
        // Dispara evento para carregar a escala
        empSelect.dispatchEvent(new Event('change'));
    }

    // Força ir para a tab pessoal
    const personalTab = document.querySelector('[data-tab="personal"]');
    if(personalTab) personalTab.click();
    
    startRequestsListener();
}

const btnLogout = document.getElementById('btnLogout');
if(btnLogout) btnLogout.addEventListener('click', () => signOut(auth));


// ==========================================
// 5. MODO COLABORADOR - LOGIN & LOGOUT
// ==========================================
const collabModal = document.getElementById('collabLoginModal');
const btnLandingCollab = document.getElementById('btnLandingCollab');
const btnCancelCollab = document.getElementById('btnCancelCollabLogin');
const btnConfirmCollab = document.getElementById('btnConfirmCollabLogin');

if(btnLandingCollab) {
    btnLandingCollab.addEventListener('click', () => {
        document.getElementById('collabEmailInput').value = '';
        document.getElementById('collabPassInput').value = '';
        collabModal.classList.remove('hidden');
    });
}

btnCancelCollab.addEventListener('click', () => collabModal.classList.add('hidden'));

btnConfirmCollab.addEventListener('click', async () => {
    const email = document.getElementById('collabEmailInput').value.trim();
    const pass = document.getElementById('collabPassInput').value;
    const btn = btnConfirmCollab;

    if(!email || !pass) return alert("Preencha todos os campos.");

    // Trava de Domínio (Apenas para o botão de Colaborador)
    if (!email.toLowerCase().endsWith('@sitelbra.com.br')) {
        alert("Acesso restrito: Utilize seu e-mail corporativo (@sitelbra.com.br).");
        return;
    }

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        await signInWithEmailAndPassword(auth, email, pass);
        collabModal.classList.add('hidden');
    } catch (e) {
        console.error(e);
        let msg = "Erro no login.";
        if(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') msg = "E-mail ou senha incorretos.";
        alert(msg);
    } finally {
        btn.innerHTML = 'Entrar';
    }
});

document.getElementById('btnCollabLogout').addEventListener('click', () => {
    signOut(auth);
});


// ==========================================
// 6. FIRESTORE DATA (ESCALA)
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
            
            // RE-RESOLUÇÃO DE NOME:
            // Importante: Se os dados chegam DEPOIS do login, precisamos
            // rodar a lógica de nome novamente para garantir o match na escala
            const user = auth.currentUser;
            if (user && !isAdmin && user.email) {
                const betterName = resolveCollaboratorName(user.email);
                // Se achou um nome melhor (que está na escala), atualiza a tela
                if (betterName !== currentUserCollab) {
                    currentUserCollab = betterName;
                    setupCollabMode(currentUserCollab);
                } else {
                    // Mesmo se o nome for igual, garante que a view pessoal seja carregada
                    setupCollabMode(currentUserCollab);
                }
            }
        } else {
            console.log("Nenhum documento encontrado.");
            rawSchedule = {}; 
            processScheduleData();
            updateDailyView();
        }
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
        statusIcon.className = "w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-cloud-upload-alt mr-2 group-hover:-translate-y-0.5 transition-transform"></i> Salvar';
        }, 1000);
    } catch (e) {
        console.error("Erro ao salvar:", e);
        btn.innerHTML = 'Erro';
    }
}
document.getElementById('btnSaveCloud').addEventListener('click', saveToCloud);

// ==========================================
// 7. LÓGICA DE SOLICITAÇÕES (REQUESTS)
// ==========================================
const requestModal = document.getElementById('requestModal');
const btnCloseReq = document.getElementById('btnCloseRequestModal');
const btnSubmitReq = document.getElementById('btnSubmitRequest');
const targetPeerSelect = document.getElementById('targetPeerSelect');
let selectedRequestDate = null;
let selectedRequestType = 'troca_folga'; 

function openRequestModal(dayIndex) {
    if(!currentUserCollab) return;
    selectedRequestDate = dayIndex;
    
    const dateStr = `${pad(dayIndex+1)}/${pad(selectedMonthObj.month+1)}`;
    document.getElementById('requestDateLabel').textContent = `Para o dia ${dateStr}`;
    document.getElementById('newShiftInput').value = '';
    targetPeerSelect.innerHTML = '<option value="">Selecione um colega...</option>';
    
    Object.keys(scheduleData).sort().forEach(name => {
        if(!name.toLowerCase().includes(currentUserCollab.toLowerCase())) {
            const opt = document.createElement('option');
            opt.value = name; opt.textContent = name;
            targetPeerSelect.appendChild(opt);
        }
    });

    requestModal.classList.remove('hidden');
}

document.querySelectorAll('.req-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.req-type-btn').forEach(b => b.classList.remove('active', 'bg-purple-500/20', 'border-purple-500', 'text-white'));
        document.querySelectorAll('.req-type-btn').forEach(b => b.classList.add('bg-[#0F1020]', 'text-gray-400', 'border-[#2E3250]'));
        
        btn.classList.remove('bg-[#0F1020]', 'text-gray-400', 'border-[#2E3250]');
        btn.classList.add('active', 'bg-purple-500/20', 'border-purple-500', 'text-white');
        
        selectedRequestType = btn.dataset.type;
        
        if(selectedRequestType === 'troca_folga') {
            document.getElementById('swapFields').classList.remove('hidden');
            document.getElementById('shiftFields').classList.add('hidden');
        } else {
            document.getElementById('swapFields').classList.add('hidden');
            document.getElementById('shiftFields').classList.remove('hidden');
        }
    });
});

btnCloseReq.addEventListener('click', () => requestModal.classList.add('hidden'));

btnSubmitReq.addEventListener('click', async () => {
    if(!selectedRequestDate && selectedRequestDate !== 0) return;
    
    const reqData = {
        requester: currentUserCollab,
        dayIndex: selectedRequestDate,
        dayLabel: `${pad(selectedRequestDate+1)}/${pad(selectedMonthObj.month+1)}`,
        monthYear: `${selectedMonthObj.year}-${selectedMonthObj.month}`,
        type: selectedRequestType,
        createdAt: new Date().toISOString(),
        status: 'pendente' 
    };

    // --- LÓGICA DE APROVAÇÃO ---
    if (selectedRequestType === 'troca_folga') {
        const target = targetPeerSelect.value;
        if(!target) return alert("Selecione um colega.");
        reqData.target = target;
        reqData.status = 'pendente_colega'; 
        reqData.description = `quer trocar folga com você no dia ${reqData.dayLabel}`;
    } 
    else {
        const newShift = document.getElementById('newShiftInput').value;
        if(!newShift) return alert("Digite o turno desejado.");
        reqData.newDetail = newShift;
        reqData.status = 'pendente_lider'; 
        reqData.description = `solicita mudança de turno para: ${newShift}`;
    }

    try {
        btnSubmitReq.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        await addDoc(collection(db, "requests"), reqData);
        requestModal.classList.add('hidden');
        alert("Solicitação enviada com sucesso!");
    } catch (e) {
        console.error(e);
        alert("Erro ao enviar.");
    } finally {
        btnSubmitReq.innerHTML = 'Enviar Solicitação';
    }
});

// ==========================================
// 8. NOTIFICAÇÕES & PROCESSAMENTO
// ==========================================
const drawer = document.getElementById('notificationDrawer');
const list = document.getElementById('notificationList');
const badges = { admin: document.getElementById('adminBadge'), collab: document.getElementById('collabBadge') };

document.getElementById('btnAdminRequests')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCollabInbox')?.addEventListener('click', () => openDrawer());
document.getElementById('btnCloseDrawer').addEventListener('click', () => drawer.classList.remove('translate-x-0'));

function openDrawer() {
    drawer.classList.add('translate-x-0');
}

function startRequestsListener() {
    const q = query(collection(db, "requests"), where("monthYear", "==", `${selectedMonthObj.year}-${selectedMonthObj.month}`));
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = '';
        let count = 0;
        
        snapshot.forEach(docSnap => {
            const req = docSnap.data();
            const rid = docSnap.id;
            
            let show = false;
            let canAction = false;
            
            if (isAdmin) {
                // Admin vê tudo que está pendente de líder
                if (req.status === 'pendente_lider') {
                    show = true;
                    canAction = true;
                    count++;
                }
            } else if (currentUserCollab) {
                // Colaborador vê se alguém pediu troca COM ELE
                if (req.status === 'pendente_colega' && req.target.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true;
                    canAction = true;
                    count++;
                }
                // Vê seus próprios pedidos
                if (req.requester.toLowerCase().includes(currentUserCollab.toLowerCase())) {
                    show = true;
                    canAction = false;
                }
            }

            if (show) {
                renderRequestItem(rid, req, canAction);
            }
        });

        if(isAdmin) {
            badges.admin.textContent = count;
            badges.admin.classList.toggle('hidden', count === 0);
        } else if (badges.collab) {
            badges.collab.textContent = count;
            badges.collab.classList.toggle('hidden', count === 0);
        }

        if(list.children.length === 0) {
            list.innerHTML = `<div class="text-center mt-10 text-gray-500"><i class="fas fa-check-circle text-4xl mb-3 opacity-20"></i><p class="text-sm">Nada pendente.</p></div>`;
        }
    });
}

function renderRequestItem(id, req, canAction) {
    let statusColor = 'gray';
    let statusText = 'Pendente';
    
    if (req.status === 'pendente_colega') { statusColor = 'orange'; statusText = `Aguardando ${req.target}`; }
    else if (req.status === 'pendente_lider') { statusColor = 'purple'; statusText = 'Aprovação do Líder'; }
    else if (req.status === 'aprovado') { statusColor = 'green'; statusText = 'Aprovado'; }
    else if (req.status === 'rejeitado') { statusColor = 'red'; statusText = 'Rejeitado'; }

    const item = document.createElement('div');
    item.className = "bg-[#0F1020] p-4 rounded-xl border border-[#2E3250] shadow-sm relative overflow-hidden";
    
    let actionButtons = '';
    if (canAction) {
        let btnText = isAdmin ? 'Aprovar Troca' : 'Concordo';
        if (req.type === 'mudanca_turno' && isAdmin) btnText = 'Aprovar Mudança';
        
        actionButtons = `
            <div class="flex gap-2 mt-3">
                <button onclick="window.rejectRequest('${id}')" class="flex-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 py-2 rounded text-xs font-bold border border-red-500/30">Recusar</button>
                <button onclick="window.acceptRequest('${id}', '${req.status}')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded text-xs font-bold shadow-lg">${btnText}</button>
            </div>
        `;
    }

    item.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <span class="text-xs font-bold text-${statusColor}-400 border border-${statusColor}-500/30 bg-${statusColor}-500/10 px-2 py-0.5 rounded uppercase">${statusText}</span>
            <span class="text-[10px] text-gray-500 font-mono">${req.dayLabel}</span>
        </div>
        <p class="text-sm text-gray-300">
            <strong class="text-white">${req.requester}</strong> ${req.description}
        </p>
        ${actionButtons}
    `;
    
    list.appendChild(item);
}

window.rejectRequest = async (id) => {
    if(!confirm("Rejeitar solicitação?")) return;
    await updateDoc(doc(db, "requests", id), { status: 'rejeitado' });
}

window.acceptRequest = async (id, currentStatus) => {
    if (currentStatus === 'pendente_colega') {
        // Colega aceitou -> Envia para o Líder
        await updateDoc(doc(db, "requests", id), { status: 'pendente_lider' });
        alert("Você concordou! Agora a solicitação foi para o líder.");
    }
    else if (currentStatus === 'pendente_lider' && isAdmin) {
        // Líder aprovou -> Aplica mudanças
        if(!confirm("Aprovar e aplicar alterações na escala?")) return;
        
        const reqSnap = await getDoc(doc(db, "requests", id));
        const req = reqSnap.data();

        applyScheduleChange(req);

        await updateDoc(doc(db, "requests", id), { status: 'aprovado' });
        await saveToCloud();
        alert("Alteração aplicada com sucesso!");
    }
}

function applyScheduleChange(req) {
    const idx = req.dayIndex;
    
    if (req.type === 'troca_folga') {
        const statusA = rawSchedule[req.requester].calculatedSchedule[idx];
        const statusB = rawSchedule[req.target].calculatedSchedule[idx];
        
        rawSchedule[req.requester].calculatedSchedule[idx] = statusB;
        rawSchedule[req.target].calculatedSchedule[idx] = statusA;
        
        scheduleData[req.requester].schedule[idx] = statusB;
        scheduleData[req.target].schedule[idx] = statusA;

    } else if (req.type === 'mudanca_turno') {
        console.log(`Alterar turno de ${req.requester} no dia ${req.dayLabel} para ${req.newDetail}`);
    }
}

// ==========================================
// 10. BOOTSTRAP
// ==========================================
function initGlobal() {
    initTabs();
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
        });
    });
}

document.addEventListener('DOMContentLoaded', initGlobal);
