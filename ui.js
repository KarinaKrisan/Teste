// ui.js (Parcial - Apenas a função de troca de abas)
// ... outras funções (updatePersonalView, etc) ...

export function switchSubTab(type) {
    state.activeRequestType = type;

    const map = {
        'troca_dia_trabalho': 'subTabWork',
        'troca_folga': 'subTabOff',
        'troca_turno': 'subTabShift'
    };
    
    // Reseta visual
    Object.values(map).forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.classList.remove('sub-tab-active', 'text-white');
            el.classList.add('text-gray-400');
        }
    });

    // Ativa botão clicado
    const activeEl = document.getElementById(map[type]);
    if(activeEl) {
        activeEl.classList.add('sub-tab-active', 'text-white');
        activeEl.classList.remove('text-gray-400');
    }

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
