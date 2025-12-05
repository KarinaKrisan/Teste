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
let dailyChart = null;
let currentDay = new Date().getDate();

// Meses
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const availableMonths = [
    { label: "Novembro 2025", year: 2025, month: 10 },
    { label: "Dezembro 2025", year: 2025, month: 11 }, 
    { label: "Janeiro 2026", year: 2026, month: 0 }
];
let selectedMonthObj = availableMonths[1]; // Dezembro 2025

function pad(n){ return n < 10 ? '0' + n : '' + n; }

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Logado:", user.email);
        
        // Admin?
        let isAdm = false;
        try {
            const q = query(collection(db, "administradores"), where("email", "==", user.email));
            const s = await getDocs(q);
            if(!s.empty) isAdm = true;
        } catch(e) { console.error(e); }

        if (isAdm) {
            isAdmin = true;
            document.getElementById('adminToolbar').classList.remove('hidden');
            renderMonthSelector();
            loadData();
        } else {
            // Colaborador
            isAdmin = false;
            document.getElementById('collabToolbar').classList.remove('hidden');
            document.getElementById('collabNameDisplay').textContent = "Carregando...";
            // Trava para ver só a própria escala
            const empSelect = document.getElementById('employeeSelect');
            empSelect.innerHTML = `<option>Carregando...</option>`;
            empSelect.disabled = true;
            
            renderMonthSelector();
            loadData();
        }
        
        document.getElementById('landingPage').classList.add('hidden');
        document.getElementById('appInterface').classList.remove('hidden');
        document.getElementById('appInterface').classList.remove('opacity-0');
    } else {
        document.getElementById('appInterface').classList.add('hidden');
        document.getElementById('landingPage').classList.remove('hidden');
    }
});

// --- DATA ---
async function loadData() {
    // IMPORTANTE: Ajuste o ID conforme o nome exato no seu banco
    const docId = `escala-${selectedMonthObj.year}-${String(selectedMonthObj.month+1).padStart(2,'0')}`;
    console.log("Buscando:", docId);

    try {
        const docSnap = await getDoc(doc(db, "escalas", docId));
        if (docSnap.exists()) {
            rawSchedule = docSnap.data();
            processSchedule();
            
            if (!isAdmin && auth.currentUser) {
                // Tenta achar o usuário na escala pelo email
                const emailPrefix = auth.currentUser.email.split('@')[0].replace('.','').toLowerCase();
                const foundKey = Object.keys(scheduleData).find(k => k.toLowerCase().replace(/\s/g,'').includes(emailPrefix));
                
                if (foundKey) {
                    currentUserCollab = foundKey;
                    renderPersonal(foundKey);
                } else {
                    alert("Seu nome não foi encontrado na escala deste mês.");
                }
            } else if(isAdmin) {
                initSelectAdmin();
                renderAllWeekends();
            }
        } else {
            console.log("Escala não encontrada.");
            scheduleData = {};
            if(!isAdmin) document.getElementById('calendarContainer').innerHTML = "<div class='p-5 text-center'>Sem escala.</div>";
        }
    } catch(e) {
        console.error("Erro dados:", e);
        alert("Erro ao baixar dados. Verifique sua conexão.");
    }
}

function processSchedule() {
    scheduleData = {};
    if(!rawSchedule) return;
    Object.keys(rawSchedule).forEach(name => {
        const s = rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [];
        scheduleData[name] = { schedule: s, info: rawSchedule[name].info || {} };
    });
}

// --- RENDER ---
function renderPersonal(name) {
    const grid = document.getElementById('calendarGrid');
    const info = document.getElementById('personalInfoCard');
    grid.innerHTML = '';
    document.getElementById('calendarContainer').classList.remove('hidden');

    if (info) {
        info.classList.remove('hidden');
        // Busca dados extras em 'colaboradores' (apenas visual)
        // Aqui simplifiquei para exibir o que temos
        info.innerHTML = `
            <div class="bg-[#1A1C2E] border border-[#2E3250] rounded-xl p-4 mb-4">
                <h2 class="text-2xl font-bold text-white">${name}</h2>
                <div class="flex gap-4 mt-2">
                    <span class="text-xs bg-purple-900 text-purple-200 px-2 py-1 rounded">Colaborador</span>
                </div>
            </div>
        `;
    }

    const sched = scheduleData[name].schedule;
    const firstDay = new Date(selectedMonthObj.year, selectedMonthObj.month, 1).getDay();

    for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));

    sched.forEach((status, i) => {
        const cell = document.createElement('div');
        cell.className = "calendar-cell border border-[#2E3250] p-1 h-20 relative cursor-pointer hover:bg-[#2E3250]";
        cell.innerHTML = `<span class="text-gray-500 text-xs font-bold">${i+1}</span><div class="mt-2 text-center font-bold text-${status==='T'?'green':'yellow'}-500">${status}</div>`;
        cell.onclick = () => { if(isAdmin) toggleStatus(name, i); };
        grid.appendChild(cell);
    });
    
    // Atualiza nome no toolbar
    if(!isAdmin) {
        document.getElementById('collabNameDisplay').textContent = name;
        const sel = document.getElementById('employeeSelect');
        sel.innerHTML = `<option>${name}</option>`;
    }
}

function renderAllWeekends() {
    const cont = document.getElementById('weekendPlantaoContainer');
    cont.innerHTML = '';
    // Lógica simplificada: varre dias e mostra quem trabalha
    // (Implementação completa na próxima iteração se necessário)
}

function initSelectAdmin() {
    const sel = document.getElementById('employeeSelect');
    sel.innerHTML = '<option value="">Selecione...</option>';
    Object.keys(scheduleData).sort().forEach(n => {
        const opt = document.createElement('option');
        opt.value = n; opt.text = n;
        sel.appendChild(opt);
    });
    sel.onchange = (e) => {
        if(e.target.value) renderPersonal(e.target.value);
        else document.getElementById('calendarContainer').classList.add('hidden');
    }
}

function toggleStatus(name, idx) {
    // Admin editing
    let s = scheduleData[name].schedule[idx];
    s = (s==='T') ? 'F' : 'T';
    scheduleData[name].schedule[idx] = s;
    renderPersonal(name);
}

function renderMonthSelector() {
    const c = document.getElementById('monthSelectorContainer');
    if(c.innerHTML) return;
    const s = document.createElement('select');
    s.className = "bg-[#1A1C2E] text-white p-2 rounded border border-[#2E3250]";
    availableMonths.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = i; o.text = m.label;
        if(m.year===2025 && m.month===11) o.selected = true;
        s.appendChild(o);
    });
    s.onchange = (e) => {
        selectedMonthObj = availableMonths[e.target.value];
        loadData();
    };
    c.appendChild(s);
}

// LOGIN BTN
const btnLogin = document.getElementById('btnConfirmCollabLogin');
if(btnLogin) {
    btnLogin.onclick = async () => {
        const e = document.getElementById('collabEmailInput').value;
        const p = document.getElementById('collabPassInput').value;
        try { await signInWithEmailAndPassword(auth, e, p); document.getElementById('collabLoginModal').classList.add('hidden'); }
        catch(err) { alert("Erro: " + err.message); }
    }
}
document.getElementById('btnLandingCollab').onclick = () => document.getElementById('collabLoginModal').classList.remove('hidden');
document.getElementById('btnCancelCollabLogin').onclick = () => document.getElementById('collabLoginModal').classList.add('hidden');
document.getElementById('btnCollabLogout').onclick = () => signOut(auth);
document.getElementById('btnLogout').onclick = () => signOut(auth);
