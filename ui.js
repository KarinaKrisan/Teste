// ui.js - Lógica visual compartilhada
import { state, pad, monthNames, availableMonths } from './config.js'; 
import * as Admin from './admin-module.js';

// --- SELETOR DE MÊS ---
export function renderMonthSelector(onPrev, onNext) {
    const container = document.getElementById('monthSelectorContainer');
    if (!container) return;

    const currentM = state.selectedMonthObj;
    const label = `${monthNames[currentM.month]} ${currentM.year}`;
    
    // Encontra o índice no array de meses disponíveis
    const currentIndex = availableMonths.findIndex(x => x.year === currentM.year && x.month === currentM.month);
    
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < availableMonths.length - 1;

    container.innerHTML = `
        <div class="flex items-center bg-[#1A1C2E] border border-[#2E3250] rounded-lg p-1 shadow-lg">
            <button id="btnMonthPrev" class="w-8 h-8 flex items-center justify-center rounded transition-colors ${hasPrev ? 'hover:bg-[#2E3250] text-gray-400 hover:text-white cursor-pointer' : 'text-gray-700 cursor-not-allowed'}" ${!hasPrev ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            
            <div class="px-4 text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 min-w-[140px] text-center uppercase tracking-wider">
                ${label}
            </div>

            <button id="btnMonthNext" class="w-8 h-8 flex items-center justify-center rounded transition-colors ${hasNext ? 'hover:bg-[#2E3250] text-gray-400 hover:text-white cursor-pointer' : 'text-gray-700 cursor-not-allowed'}" ${!hasNext ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    const btnPrev = document.getElementById('btnMonthPrev');
    const btnNext = document.getElementById('btnMonthNext');
    
    if(btnPrev && hasPrev) btnPrev.onclick = onPrev;
    if(btnNext && hasNext) btnNext.onclick = onNext;
}

// --- VISUALIZAÇÃO COMPARTILHADA ---

// 1. Escala Individual (Crachá + Calendário)
export function updatePersonalView(name) {
    // Se não tiver dados para esse nome, para aqui
    if(!name || !state.scheduleData[name]) return;
    
    const emp = state.scheduleData[name];
    const info = emp.info || {};
    
    // --- BLINDAGEM DE CAMPOS (Lê maiúsculo, minúsculo e sem acento) ---
    const role = info.Role || info.role || info.Cargo || info.cargo || 'Colaborador';
    
    // Tenta: Célula, Celula, célula, celula
    const cell = info.Célula || info.Celula || info.célula || info.celula || '--';
    
    // Tenta: Turno, turno
    const shift = info.Turno || info.turno || '--';
    
    // Tenta: Horário, Horario, horário, horario
    const hours = info.Horário || info.Horario || info.horário || info.horario || '--';

    // Atualiza o Crachá
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
    
    // Atualiza o Calendário
    document.getElementById('calendarContainer').classList.remove('hidden');
    updateCalendar(name, emp.schedule);
}

export function updateCalendar(name, schedule) {
    const grid = document.getElementById('calendarGrid');
    if(!grid) return;
    
    grid.innerHTML = '';
    
    // Calcula espaços vazios no início do mês
    const empty = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, 1).getDay();
    for(let i=0;i<empty;i++) grid.innerHTML+='<div class="h-20 bg-[#1A1C2E] opacity-50"></div>';
    
    // Renderiza os dias
    if (schedule && Array.isArray(schedule)) {
        schedule.forEach((st, i) => {
            grid.innerHTML += `
            <div onclick="window.handleCellClick('${name}',${i})" class="h-20 bg-[#161828] border border-[#2E3250] p-1 cursor-pointer hover:bg-[#1F2136] relative group transition-colors">
                <span class="text-gray-500 text-xs font-bold">${i+1}</span>
                <div class="mt-2 text-center text-xs font-bold rounded status-${st}">${st}</div>
            </div>`;
        });
    }
}

// 2. Plantão Fins de Semana
export function updateWeekendTable(targetName) {
    const container = document.getElementById('weekendPlantaoContainer');
    if(!container) return;
    
    container.innerHTML = '';
    
    if(!state.scheduleData || Object.keys(state.scheduleData).length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum dado de escala disponível.</p>';
        return;
    }
    
    const totalDays = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month+1, 0).getDate();

    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(state.selectedMonthObj.year, state.selectedMonthObj.month, d);
        if (date.getDay() === 6) { // Sábado
            const satIndex = d - 1;
            const sunIndex = d;
            const hasSunday = (d + 1) <= totalDays;
            let satWorkers = [], sunWorkers = [];

            Object.keys(state.scheduleData).forEach(name => {
                if (state.scheduleData[name] && state.scheduleData[name].schedule) {
                    const s = state.scheduleData[name].schedule;
                    if (s[satIndex] === 'T') satWorkers.push(name);
                    if (hasSunday && s[sunIndex] === 'T') sunWorkers.push(name);
                }
            });

            // Filtro: Se targetName for null, mostra todos. Se tiver nome, mostra só se ele estiver trabalhando.
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
    if (container.innerHTML === '') container.innerHTML = '<p class="text-gray-500 text-sm italic col-span-full text-center py-4">Nenhum plantão encontrado.</p>';
}

// 3. Controle das Sub-Abas (Trocas)
export function switchSubTab(type) {
    state.activeRequestType = type;

    const map = {
        'troca_dia_trabalho': 'subTabWork',
        'troca_folga': 'subTabOff',
        'troca_turno': 'subTabShift'
    };
    
    // Reseta todos os botões
    Object.values(map).forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('sub-tab-active', 'text-white', 'bg-[#2E3250]');
            el.classList.add('text-gray-400');
        }
    });

    // Ativa o botão selecionado
    const activeEl = document.getElementById(map[type]);
    if(activeEl) {
        activeEl.classList.add('sub-tab-active', 'text-white');
        activeEl.classList.remove('text-gray-400');
    }

    // Atualiza Texto do Botão Principal "Nova Solicitação"
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
