// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

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
export const state = {
    isAdmin: false,
    currentUser: null,
    profile: null, 
    scheduleData: {}, 
    rawSchedule: {}, 
    currentDay: new Date().getDate(),
    selectedMonthObj: null,
    activeRequestType: 'troca_dia_trabalho'
};

const d = new Date();
export const availableMonths = [ 
    { year: 2025, month: 10 }, { year: 2025, month: 11 }, 
    //{ year: 2026, month: 0 }, { year: 2026, month: 1 }, { year: 2026, month: 2 }, 
    //{ year: 2026, month: 3 }, { year: 2026, month: 4 }, { year: 2026, month: 5 } 
];
state.selectedMonthObj = availableMonths.find(m => m.year === d.getFullYear() && m.month === d.getMonth()) || availableMonths[availableMonths.length-1];

export const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
export const daysOfWeek = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

export const pad = (n) => n < 10 ? '0' + n : '' + n;

export function hideLoader() {
    const overlay = document.getElementById('appLoadingOverlay');
    if(overlay) {
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 500);
    }
}

// --- LÓGICA CORRIGIDA DE HORÁRIO ---
export function isWorkingTime(timeRange) {
    if (!timeRange || typeof timeRange !== 'string') return false; // Se não tiver horário, assume que não está trabalhando (ou trata como F)

    // Extrai as horas. Ex: "08:00 às 17:48" -> ["08:00", "17:48"]
    const times = timeRange.match(/(\d{1,2}:\d{2})/g);
    if (!times || times.length < 2) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = times[0].split(':').map(Number);
    const [endH, endM] = times[1].split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    // Caso Turno da Noite (Ex: 22:00 as 06:00)
    if (endTotal < startTotal) {
        return (currentMinutes >= startTotal || currentMinutes < endTotal);
    } 
    // Caso Turno Normal (Ex: 08:00 as 17:48)
    else {
        return (currentMinutes >= startTotal && currentMinutes < endTotal);
    }
}
