// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// --- FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCBKSPH7lfUt0VsQPhJX3a0CQ2wYcziQvM",
  authDomain: "dadosescala.firebaseapp.com",
  projectId: "dadosescala",
  storageBucket: "dadosescala.firebasestorage.app",
  messagingSenderId: "117221956502",
  appId: "1:117221956502:web:e5a7f051daf3306b501bb7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// --- ESTADO GLOBAL ---
const d = new Date(); // Data real de hoje

export const state = {
    isAdmin: false,
    currentUser: null,
    profile: null, 
    scheduleData: {}, 
    rawSchedule: {}, 
    currentDay: d.getDate(), // INICIALIZA COM O DIA DE HOJE
    selectedMonthObj: null,
    activeRequestType: 'troca_dia_trabalho'
};

// --- CONFIG DATA ---
export const availableMonths = [ 
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    { year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, 
    { year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 } 
];
// Seleciona o mês atual ou o último disponível
state.selectedMonthObj = availableMonths.find(m => m.year === d.getFullYear() && m.month === d.getMonth()) || availableMonths[availableMonths.length-1];

export const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

// --- HELPERS ---
export const pad = (n) => n < 10 ? '0' + n : '' + n;

export function hideLoader() {
    const overlay = document.getElementById('appLoadingOverlay');
    if(overlay) {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 500);
    }
}

// LÓGICA DE HORÁRIO ATUALIZADA
export function isWorkingTime(timeRange) {
    if (!timeRange || typeof timeRange !== 'string') return false; 
    const times = timeRange.match(/(\d{1,2}:\d{2})/g);
    if (!times || times.length < 2) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = times[0].split(':').map(Number);
    const [endH, endM] = times[1].split(':').map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    return (endTotal < startTotal) ? (currentMinutes >= startTotal || currentMinutes < endTotal) : (currentMinutes >= startTotal && currentMinutes < endTotal);
}
