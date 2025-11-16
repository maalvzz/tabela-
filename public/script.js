// CONFIGURAÇÃO
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/api'
    : `${window.location.origin}/api`;

let precos = [];
let isOnline = false;
let marcaSelecionada = 'TODAS';
let marcasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;

// LOG APENAS NO INÍCIO
console.log('🚀 Tabela de Preços iniciada');

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning' } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'success'}" id="modalConfirmBtn">${confirmText}</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('confirmModal');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        const closeModal = (result) => {
            modal.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { modal.remove(); resolve(result); }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        
        // REMOVIDO: Não fecha mais ao clicar fora do modal de confirmação
        // modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(false); });

        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `@keyframes fadeOut { to { opacity: 0; } }`;
            document.head.appendChild(style);
        }
    });
}

function showFormModal(editingId = null) {
    const isEditing = editingId !== null;
    const preco = isEditing ? precos.find(p => p.id === editingId) : null;

    const modalHTML = `
        <div class="modal-overlay" id="formModal">
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 class="modal-title">${isEditing ? 'Editar' : 'Registrar'}</h3>
                </div>
                <div class="modal-form-content">
                    <form id="modalPrecoForm">
                        <input type="hidden" id="modalEditId" value="${editingId || ''}">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="modalMarca">Marca *</label>
                                <input type="text" id="modalMarca" value="${preco?.marca || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="modalCodigo">Código *</label>
                                <input type="text" id="modalCodigo" value="${preco?.codigo || ''}" required>
                            </div>
                            <div class="form-group">
                                <label for="modalPreco">Preço (R$) *</label>
                                <input type="number" id="modalPreco" step="0.01" min="0" value="${preco?.preco || ''}" required>
                            </div>
                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="modalDescricao">Descrição *</label>
                                <textarea id="modalDescricao" rows="3" required>${preco?.descricao || ''}</textarea>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="secondary" id="modalCancelFormBtn">Cancelar</button>
                            <button type="submit" class="save">${isEditing ? 'Atualizar' : 'Salvar'}</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('formModal');
    const form = document.getElementById('modalPrecoForm');
    const cancelBtn = document.getElementById('modalCancelFormBtn');
    const descricaoField = document.getElementById('modalDescricao');
    const editId = document.getElementById('modalEditId').value;
    const isEditing = editId !== '';

    descricaoField.addEventListener('input', (e) => {
        const start = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, start);
    });

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => modal.remove(), 200);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            marca: document.getElementById('modalMarca').value.trim(),
            codigo: document.getElementById('modalCodigo').value.trim(),
            preco: parseFloat(document.getElementById('modalPreco').value),
            descricao: document.getElementById('modalDescricao').value.trim().toUpperCase()
        };

        const editId = document.getElementById('modalEditId').value;
        const codigoDuplicado = precos.find(p => p.codigo.toLowerCase() === formData.codigo.toLowerCase() && p.id !== editId);

        if (codigoDuplicado) {
            showMessage(`Código "${formData.codigo}" já existe`, 'error');
            return;
        }

        const tempId = editId || 'temp_' + Date.now();
        const optimisticData = { ...formData, id: tempId, timestamp: new Date().toISOString() };

        if (editId) {
            const index = precos.findIndex(p => p.id === editId);
            if (index !== -1) precos[index] = optimisticData;
            showMessage('Atualizado!', 'success');
        } else {
            precos.push(optimisticData);
            showMessage('Criado!', 'success');
        }

        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
        closeModal();
        syncWithServer(formData, editId, tempId);
    });

    // Botão Cancelar - mostra mensagem e fecha
    cancelBtn.addEventListener('click', () => {
        showMessage(isEditing ? 'Atualização cancelada' : 'Registro cancelado', 'error');
        closeModal();
    });
    
    // REMOVIDO: Não fecha mais ao clicar fora do modal
    // modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    
    setTimeout(() => document.getElementById('modalMarca').focus(), 100);
}

function verificarAutenticacao() {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('tabelaPrecosSession', sessionToken);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        sessionToken = sessionStorage.getItem('tabelaPrecosSession');
    }

    if (!sessionToken) {
        mostrarTelaAcessoNegado();
        return;
    }

    inicializarApp();
}

function mostrarTelaAcessoNegado(mensagem = 'NÃO AUTORIZADO') {
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: var(--bg-primary);
            color: var(--text-primary);
            text-align: center;
            padding: 2rem;
        ">
            
            <h1 style="font-size: 2.2rem; margin-bottom: 1rem;">
                ${mensagem}
            </h1>

            <p style="color: var(--text-secondary); margin-bottom: 2rem;">
                Somente usuários autenticados podem acessar esta área.
            </p>

            <a href="${PORTAL_URL}" style="
                display: inline-block;
                background: var(--btn-register);
                color: white;
                padding: 14px 32px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
            ">Ir para o Portal</a>
        </div>
    `;
}



function inicializarApp() {
    checkServerStatus();
    setInterval(checkServerStatus, 15000); // A cada 15 segundos
    startPolling();
}

window.toggleForm = function() {
    showFormModal(null);
};

async function checkServerStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${API_URL}/precos`, {
            method: 'HEAD',
            headers: { 'X-Session-Token': sessionToken },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return false;
        }

        const wasOffline = !isOnline;
        isOnline = response.ok;
        
        // LOG APENAS QUANDO MUDA DE STATUS
        if (wasOffline && isOnline) {
            console.log('✅ Servidor ONLINE');
            await loadPrecos();
        } else if (!wasOffline && !isOnline) {
            console.log('❌ Servidor OFFLINE');
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) {
        if (isOnline) {
            console.log('❌ Erro de conexão:', error.message);
        }
        isOnline = false;
        updateConnectionStatus();
        return false;
    }
}

function updateConnectionStatus() {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = isOnline ? 'connection-status online' : 'connection-status offline';
    }
}

async function loadPrecos() {
    if (!isOnline) return;

    try {
        const response = await fetch(`${API_URL}/precos`, {
            headers: { 'X-Session-Token': sessionToken }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const newHash = JSON.stringify(data.map(p => p.id));

        if (newHash !== lastDataHash) {
            precos = data.map(item => ({ ...item, descricao: item.descricao.toUpperCase() }));
            lastDataHash = newHash;
            
            // LOG APENAS NA PRIMEIRA VEZ OU QUANDO MUDAR
            console.log(`📊 ${data.length} preços carregados`);
            
            atualizarMarcasDisponiveis();
            renderMarcasFilter();
            filterPrecos();
        }
    } catch (error) {
        // Silencioso - não loga
    }
}

function startPolling() {
    loadPrecos();
    setInterval(() => {
        if (isOnline) loadPrecos();
    }, 10000); // A cada 10 segundos
}

function atualizarMarcasDisponiveis() {
    marcasDisponiveis.clear();
    precos.forEach(p => {
        if (p.marca && p.marca.trim()) marcasDisponiveis.add(p.marca.trim());
    });
}

function renderMarcasFilter() {
    const container = document.getElementById('marcasFilter');
    if (!container) return;

    const marcasArray = Array.from(marcasDisponiveis).sort();
    const buttons = ['TODAS', ...marcasArray].map(marca => {
        const isActive = marca === marcaSelecionada ? 'active' : '';
        return `<button class="brand-button ${isActive}" onclick="window.selecionarMarca('${marca}')">${marca}</button>`;
    }).join('');

    container.innerHTML = buttons;
}

window.selecionarMarca = function(marca) {
    marcaSelecionada = marca;
    renderMarcasFilter();
    filterPrecos();
};

async function syncWithServer(formData, editId = null, tempId = null) {
    if (!isOnline) return;

    try {
        const url = editId ? `${API_URL}/precos/${editId}` : `${API_URL}/precos`;
        const method = editId ? 'PUT' : 'POST';

        const response = await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken }, 
            body: JSON.stringify(formData) 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        
        const savedData = await response.json();
        savedData.descricao = savedData.descricao.toUpperCase();

        if (editId) {
            const index = precos.findIndex(p => p.id === editId);
            if (index !== -1) precos[index] = savedData;
        } else {
            const tempIndex = precos.findIndex(p => p.id === tempId);
            if (tempIndex !== -1) precos[tempIndex] = savedData;
        }

        lastDataHash = JSON.stringify(precos.map(p => p.id));
        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
    } catch (error) {
        if (!editId) {
            precos = precos.filter(p => p.id !== tempId);
            filterPrecos();
        }
        showMessage('Erro ao salvar', 'error');
    }
}

window.editPreco = function(id) {
    showFormModal(id);
};

window.deletePreco = async function(id) {
    const confirmed = await showConfirm('Tem certeza que deseja excluir?', {
        title: 'Excluir Registro',
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'warning'
    });

    if (!confirmed) return;

    const deletedPreco = precos.find(p => p.id === id);
    precos = precos.filter(p => p.id !== id);
    atualizarMarcasDisponiveis();
    renderMarcasFilter();
    filterPrecos();
    showMessage('Excluído!', 'error');

    if (isOnline) {
        try {
            const response = await fetch(`${API_URL}/precos/${id}`, { 
                method: 'DELETE',
                headers: { 'X-Session-Token': sessionToken }
            });

            if (response.status === 401) {
                sessionStorage.removeItem('tabelaPrecosSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }

            if (!response.ok) throw new Error('Erro ao deletar');
        } catch (error) {
            if (deletedPreco) {
                precos.push(deletedPreco);
                atualizarMarcasDisponiveis();
                renderMarcasFilter();
                filterPrecos();
                showMessage('Erro ao excluir', 'error');
            }
        }
    }
};

function filterPrecos() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    let filtered = precos;

    if (marcaSelecionada !== 'TODAS') {
        filtered = filtered.filter(p => p.marca === marcaSelecionada);
    }

    if (searchTerm) {
        filtered = filtered.filter(p => 
            p.codigo.toLowerCase().includes(searchTerm) ||
            p.marca.toLowerCase().includes(searchTerm) ||
            p.descricao.toLowerCase().includes(searchTerm)
        );
    }

    filtered.sort((a, b) => {
        const marcaCompare = a.marca.localeCompare(b.marca);
        if (marcaCompare !== 0) return marcaCompare;
        return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    });

    renderPrecos(filtered);
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Sem data';
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d`;
    return past.toLocaleDateString('pt-BR');
}

function renderPrecos(precosToRender) {
    const container = document.getElementById('precosContainer');
    
    if (!precosToRender || precosToRender.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Nenhum registro encontrado</div>';
        return;
    }

    const table = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Marca</th>
                        <th>Código</th>
                        <th>Preço</th>
                        <th>Descrição</th>
                        <th>Alteração</th>
                        <th style="text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${precosToRender.map(p => `
                        <tr>
                            <td><strong>${p.marca}</strong></td>
                            <td>${p.codigo}</td>
                            <td>R$ ${parseFloat(p.preco).toFixed(2)}</td>
                            <td>${p.descricao}</td>
                            <td style="color: var(--text-secondary); font-size: 0.85rem;">${getTimeAgo(p.timestamp)}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="window.editPreco('${p.id}')" class="action-btn edit">Editar</button>
                                <button onclick="window.deletePreco('${p.id}')" class="action-btn delete">Excluir</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = table;
}

function showMessage(message, type) {
    // Remove mensagens antigas
    const oldMessages = document.querySelectorAll('.floating-message');
    oldMessages.forEach(msg => msg.remove());
    
    // Cria nova mensagem flutuante (mesma aparência do status-message)
    const messageDiv = document.createElement('div');
    messageDiv.className = `floating-message ${type}`;
    messageDiv.textContent = message;
    
    // Adiciona no body para aparecer acima do modal
    document.body.appendChild(messageDiv);
    
    // Remove após 3 segundos
    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}
