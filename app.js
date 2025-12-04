// ==========================================
// FUNÇÕES DE RENDERIZAÇÃO (FALTANTES)
// ==========================================

// 1. Processa os dados brutos do Firebase para o formato do App
function processScheduleData() {
    scheduleData = {};
    
    // Se não houver dados, para por aqui
    if (!rawSchedule) return;

    Object.keys(rawSchedule).forEach(name => {
        // Pega o array de status (ex: ['T', 'T', 'F', ...])
        // Tenta pegar de 'calculatedSchedule' ou 'schedule'
        const scheduleArr = rawSchedule[name].calculatedSchedule || rawSchedule[name].schedule || [];
        
        scheduleData[name] = {
            schedule: scheduleArr,
            info: rawSchedule[name].info || {} // Cargo, setor, etc.
        };
    });
    
    console.log("Dados processados:", scheduleData);
}

// 2. Atualiza a Aba "Visão Diária" (KPIs e Listas)
function updateDailyView() {
    // Atualiza label da data
    const dateLabel = document.getElementById('currentDateLabel');
    const day = currentDay; // Variável global
    const month = monthNames[selectedMonthObj.month];
    if(dateLabel) dateLabel.textContent = `${day} de ${month}`;

    // Referências aos elementos HTML
    const listWorking = document.getElementById('listWorking');
    const listOff = document.getElementById('listOff');
    const listOffShift = document.getElementById('listOffShift');
    const listVacation = document.getElementById('listVacation');
    
    const kpiWorking = document.getElementById('kpiWorking');
    const kpiOff = document.getElementById('kpiOff');
    const kpiOffShift = document.getElementById('kpiOffShift');
    const kpiVacation = document.getElementById('kpiVacation');

    // Limpa as listas atuais
    if(listWorking) listWorking.innerHTML = '';
    if(listOff) listOff.innerHTML = '';
    if(listOffShift) listOffShift.innerHTML = '';
    if(listVacation) listVacation.innerHTML = '';

    // Contadores
    let countWorking = 0, countOff = 0, countOffShift = 0, countVacation = 0;

    // Percorre todos os colaboradores
    Object.keys(scheduleData).sort().forEach(name => {
        // O array é base 0, o dia é base 1 (Dia 1 = índice 0)
        const status = scheduleData[name].schedule[day - 1]; 

        const li = document.createElement('li');
        li.className = "text-xs p-2 rounded bg-[#1A1C2E] border border-[#2E3250] flex justify-between items-center";
        li.innerHTML = `<span class="font-bold text-gray-300">${name}</span> <span class="opacity-50 text-[10px]">${status || '-'}</span>`;

        if (status === 'T') {
            countWorking++;
            if(listWorking) listWorking.appendChild(li);
        } 
        else if (['F', 'FS', 'FD'].includes(status)) {
            countOff++;
            if(listOff) listOff.appendChild(li);
        }
        else if (status === 'FE') {
            countVacation++;
            if(listVacation) listVacation.appendChild(li);
        }
        else {
            // OFF-SHIFT, F_EFFECTIVE ou undefined
            countOffShift++;
            if(listOffShift) listOffShift.appendChild(li);
        }
    });

    // Atualiza os números grandes (KPIs) com animação simples
    if(kpiWorking) kpiWorking.textContent = countWorking;
    if(kpiOff) kpiOff.textContent = countOff;
    if(kpiOffShift) kpiOffShift.textContent = countOffShift;
    if(kpiVacation) kpiVacation.textContent = countVacation;

    // Atualiza o Gráfico (se existir)
    updateChart(countWorking, countOff, countOffShift, countVacation);
}

// 3. Inicializa o Dropdown da "Escala Individual"
function initSelect() {
    const select = document.getElementById('employeeSelect');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um colaborador</option>';
    
    Object.keys(scheduleData).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    // Evento ao selecionar alguém
    select.addEventListener('change', (e) => {
        const name = e.target.value;
        if (name && scheduleData[name]) {
            renderPersonalCalendar(name);
        } else {
            document.getElementById('calendarContainer').classList.add('hidden');
        }
    });
}

// 4. Renderiza o Calendário Individual (Grid)
function renderPersonalCalendar(name) {
    const container = document.getElementById('calendarContainer');
    const grid = document.getElementById('calendarGrid');
    const infoCard = document.getElementById('personalInfoCard');
    
    if(!container || !grid) return;
    
    container.classList.remove('hidden');
    grid.innerHTML = '';
    
    // Info básica
    if(infoCard) {
        infoCard.classList.remove('hidden');
        infoCard.innerHTML = `<h3 class="text-lg font-bold text-white">${name}</h3><p class="text-sm text-gray-400">Escala Mensal</p>`;
    }

    const schedule = scheduleData[name].schedule;
    const totalDays = schedule.length; // Deve ser 30, 31, etc.

    // Loop pelos dias do mês
    for (let i = 0; i < totalDays; i++) {
        const status = schedule[i] || '-';
        const dayNum = i + 1;
        
        const cell = document.createElement('div');
        cell.className = "calendar-cell border-b border-r border-[#2E3250] relative group cursor-pointer"; // Adicionei classes básicas
        
        // CSS da badge baseado no status (usa classes do styless.css)
        let badgeClass = "day-status-badge ";
        if(status === 'T') badgeClass += "status-T";
        else if(['F', 'FS', 'FD'].includes(status)) badgeClass += "status-F"; // Simplificado, ajuste conforme necessidade
        else if(status === 'FE') badgeClass += "status-FE";
        else badgeClass += "status-OFF-SHIFT";

        cell.innerHTML = `
            <div class="day-number">${dayNum}</div>
            <div class="${badgeClass}">${status}</div>
        `;

        // Clique no dia (para admin editar ou collab solicitar)
        cell.addEventListener('click', () => {
            if(isAdmin) {
                // Lógica simples de edição rápida para Admin (alternar status)
                // Exemplo: toggleStatus(name, i);
                alert(`Admin: Editar dia ${dayNum} de ${name}`);
            } else if(currentUserCollab === name) {
                // Abre modal de solicitação
                openRequestModal(i); // i é o index (dia - 1)
            }
        });

        grid.appendChild(cell);
    }
}

// 5. Função auxiliar para o gráfico (Chart.js)
function updateChart(working, off, offShift, vacation) {
    const ctx = document.getElementById('dailyChart');
    if (!ctx) return;

    // Se o gráfico já existe, destrua para recriar (ou atualize os dados)
    if (dailyChart) {
        dailyChart.data.datasets[0].data = [working, off, vacation, offShift];
        dailyChart.update();
        return;
    }

    // Cria novo gráfico
    dailyChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Trab.', 'Folga', 'Férias', 'Encerr.'],
            datasets: [{
                data: [working, off, vacation, offShift],
                backgroundColor: ['#22c55e', '#eab308', '#ef4444', '#d946ef'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            }
        }
    });
}
