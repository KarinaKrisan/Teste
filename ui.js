// ui.js - Lógica visual compartilhada
import { state, pad } from './config.js';
import * as Admin from './admin-module.js';

// --- VISUALIZAÇÃO COMPARTILHADA ---

// 1. Escala Individual (Crachá + Calendário)
export function updatePersonalView(name) {
    if(!name || !state.scheduleData[name]) return;
    const emp = state.scheduleData[name];
    
    // Fallbacks para dados
    const info = emp.info || {};
    const role = info.Cargo || 'Colaborador';
    const cell = info.Célula || info.Celula || '--';
    const shift = info.Turno || '--';
    const hours = info.Horário || info.Horario || '--';

    const card = document.getElementById('personalInfoCard');
    if(card) {
        card.innerHTML = `
        <div class="badge-card rounded-2xl shadow-2xl p-0 bg-[#1A1C2E] border border-purple-500/20 relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>
            <div class="p-6">
                <div class="flex items-center gap-5">
                    <div class="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30 flex items-center justify-center">
                        <i class="fas fa-user text-2xl text-purple-300"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white">${name}</h2>
                        <p class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 uppercase mt-1">${role}</p>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/5">
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Célula</p><p class="text-sm font-bold text-white font-mono">${cell}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Turno</p><p class="text-sm font-bold text-white font-mono">${shift}</p></div>
                    <div class="text-center md:text-left"><p class="text-[10px] uppercase font-bold text-gray-500">Horário</p><p class="text-sm font-bold text-white font-mono">${hours}</p></div>
                </div>
            </div>
        </div>`;
        card.classList.remove('hidden');
    }
    
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

export function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    
    grid.innerHTML = '';
    const empty = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, 1).getDay();
    for(let i=0;i<empty;i++) grid.innerHTML+='<div class="h-20 bg-[#1A1C2E] opacity-50"></div>';
    
    schedule.forEach((st, i) => {
        grid.innerHTML += `
        <div onclick="window.handleCellClick('${name}',${i})" class="h-20 bg-[#161828] border border-[#2E3250] p-1 cursor-pointer hover:bg-[#1F2136] relative group">
            <span class="text-gray-500 text-xs">${i+1}</span>
            <div class="mt-2 text-center text-xs font-bold rounded status-${st}">${st}</div>
        </div>`;
    });
}

// 2. Plantão Fins de Semana
export function updateWeekendTable(targetName) {
    const container = document.getElementById('weekendPlantaoContainer');
    if(!container) return;
    
    container.innerHTML = '';
    
    if(Object.keys(state.scheduleData).length === 0) return;
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, d);
        if (date.getDay() === 6) { 
            const satIndex = d - 1;
            const sunIndex = d;
            const hasSunday = (d + 1) <= totalDays;
            let satWorkers = [], sunWorkers = [];

            Object.keys(state.scheduleData).forEach(name => {
                const s = state.scheduleData[name].schedule;
                if (s[satIndex] === 'T') satWorkers.push(name);
                if (hasSunday && s[sunIndex] === 'T') sunWorkers.push(name);
            });

            const shouldShow = targetName === null ? (satWorkers.length > 0 || sunWorkers.length > 0) : (satWorkers.includes(targetName) || sunWorkers.includes(targetName));

            if (shouldShow) {
                const satDate = `${pad(d)}/${pad(state.selectedMonthObj.month+1)}`;
                const sunDate = hasSunday ? `${pad(d+1)}/${pad(state.selectedMonthObj.month+1)}` : '-';
                
                container.insertAdjacentHTML('beforeend', `
                <div class="bg-[#1A1C2E] border border-cronos-border rounded-2xl shadow-lg overflow-hidden flex flex-col">
                    <div class="bg-[#0F1020] p-3 border-b border-cronos-border flex justify-between items-center"><span class="text-sky-400 font-bold text-xs uppercase tracking-wider">Fim de Semana</span></div>
                    <div class="p-4 space-y-4 flex-1">
                        <div>
                            <h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex justify-between"><span>Sábado</span><span class="text-sky-400">${satDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${satWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-green-900/20 text-green-400 border border-green-500/20 ${n===targetName?'font-bold ring-1 ring-green-500':''}">${n}</span>`).join('')}</div>
                        </div>
                        ${hasSunday ? `<div>
                            <div class="pt-3 border-t border-[#2E3250]"><h4 class="text-gray-500 text-[10px] font-bold uppercase mb-2 flex justify-between"><span>Domingo</span><span class="text-indigo-400">${sunDate}</span></h4>
                            <div class="flex flex-wrap gap-1">${sunWorkers.map(n=>`<span class="text-xs px-2 py-1 rounded bg-indigo-900/20 text-indigo-400 border border-indigo-500/20 ${n===targetName?'font-bold ring-1 ring-indigo-500':''}">${n}</span>`).join('')}</div></div>
                        </div>` : ''}
                    </div>
                </div>`);
            }
        }
    }
    if (container.innerHTML === '') container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum plantão.</p>';
}

// 3. Controle das Sub-Abas (Trocas) [NOVA FUNÇÃO ADICIONADA]
export function switchSubTab(type) {
    state.activeRequestType = type;

    // Atualiza classes visuais
    const map = {
        'troca_dia_trabalho': 'subTabWork',
        'troca_folga': 'subTabOff',
        'troca_turno': 'subTabShift'
    };
    
    // Remove active de todos
    Object.values(map).forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('sub-tab-active');
    });

    // Adiciona active ao atual
    const activeEl = document.getElementById(map[type]);
    if(activeEl) activeEl.classList.add('sub-tab-active');

    // Atualiza Texto do Botão Principal
    const btnLabel = document.getElementById('btnNewRequestLabel');
    if(btnLabel) {
        const labels = {
            'troca_dia_trabalho': 'Solicitar Troca de Dia',
            'troca_folga': 'Solicitar Troca de Folga',
            'troca_turno': 'Solicitar Troca de Turno'
        };
        btnLabel.textContent = labels[type];
    }
}
