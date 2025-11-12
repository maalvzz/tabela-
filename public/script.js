// ==========================================
// ======== CONFIGURAÇÃO ====================
// ==========================================
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/api'
    : `${window.location.origin}/api`;

const POLLING_INTERVAL = 3000;

let precos = [];
let isOnline = false;
let marcaSelecionada = 'TODAS';
let marcasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;
let sessionCheckInterval = null;

console.log('API URL configurada:', API_URL);

document.addEventListener('DOMContentLoaded', () => {
    verificarAutenticacao();
});

// ==========================================
// ======== MODAL DE CONFIRMAÇÃO ============
// ==========================================
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Confirmação',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning' // 'warning' ou 'info'
        } = options;

        const modalHTML = `
            <div class="modal-overlay" id="confirmModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <p class="modal-message">${message}</p>
                    <div class="modal-actions">
                        <button class="secondary" id="modalCancelBtn">${cancelText}</button>
                        <button class="${type === 'warning' ? 'danger' : 'primary'}" id="modalConfirmBtn">${confirmText}</button>
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
            setTimeout(() => {
                modal.remove();
                resolve(result);
            }, 200);
        };

        confirmBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        
        // Fechar ao clicar fora do modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(false);
        });

        // Adicionar animação de fade out ao CSS
        if (!document.querySelector('#modalAnimations')) {
            const style = document.createElement('style');
            style.id = 'modalAnimations';
            style.textContent = `
                @keyframes fadeOut {
                    to {
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    });
}

// ==========================================
// ======== MODAL DE FORMULÁRIO =============
// ==========================================
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
                                <input type="text" id="modalMarca" placeholder="Nome da marca" value="${preco?.marca || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalCodigo">Código *</label>
                                <input type="text" id="modalCodigo" placeholder="Código do produto" value="${preco?.codigo || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="modalPreco">Preço (R$) *</label>
                                <input type="number" id="modalPreco" step="0.01" min="0" value="${preco?.preco || ''}" required>
                            </div>

                            <div class="form-group" style="grid-column: 1 / -1;">
                                <label for="modalDescricao">Descrição do Produto *</label>
                                <textarea id="modalDescricao" rows="3" placeholder="Descrição do produto..." required>${preco?.descricao || ''}</textarea>
                            </div>
                        </div>

                        <div class="modal-actions">
                            <button type="button" class="secondary" id="modalCancelFormBtn">Cancelar</button>
                            <button type="submit" class="primary">${isEditing ? 'Atualizar' : 'Salvar'}</button>
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

    const closeModal = () => {
        modal.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => {
            modal.remove();
        }, 200);
    };

    // Submeter formulário
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            marca: document.getElementById('modalMarca').value.trim(),
            codigo: document.getElementById('modalCodigo').value.trim(),
            preco: parseFloat(document.getElementById('modalPreco').value),
            descricao: document.getElementById('modalDescricao').value.trim()
        };

        const editId = document.getElementById('modalEditId').value;

        const codigoDuplicado = precos.find(p => 
            p.codigo.toLowerCase() === formData.codigo.toLowerCase() && p.id !== editId
        );

        if (codigoDuplicado) {
            showMessage(`Erro: O código "${formData.codigo}" já está cadastrado`, 'error');
            document.getElementById('modalCodigo').focus();
            return;
        }

        // Atualização instantânea na interface
        const tempId = editId || 'temp_' + Date.now();
        const optimisticData = { ...formData, id: tempId, timestamp: new Date().toISOString() };

        if (editId) {
            const index = precos.findIndex(p => p.id === editId);
            if (index !== -1) precos[index] = optimisticData;
            showMessage('Registro atualizado!', 'success');
        } else {
            precos.push(optimisticData);
            showMessage('Registro criado!', 'success');
        }

        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
        closeModal();

        // Sincronização em segundo plano
        syncWithServer(formData, editId, tempId);
    });

    // Cancelar
    cancelBtn.addEventListener('click', closeModal);

    // Fechar ao clicar fora do modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Focar no primeiro campo
    setTimeout(() => {
        document.getElementById('modalMarca').focus();
    }, 100);
}

// ==========================================
// ======== VERIFICAR AUTENTICAÇÃO ==========
// ==========================================
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

    verificarSessaoValida();
}

async function verificarSessaoValida() {
    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        const data = await response.json();

        if (!data.valid) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado(data.message);
            return;
        }

        iniciarAplicacao();
    } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        mostrarTelaAcessoNegado('Erro ao verificar autenticação');
    }
}

function iniciarAplicacao() {
    loadPrecos();
    startRealtimeSync();
    startSessionCheck();
}

// ==========================================
// ======== VERIFICAÇÃO PERIÓDICA DE SESSÃO =
// ==========================================
function startSessionCheck() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }

    sessionCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });

            const data = await response.json();

            if (!data.valid) {
                clearInterval(sessionCheckInterval);
                sessionStorage.removeItem('tabelaPrecosSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
        }
    }, 30000); // Verifica a cada 30 segundos
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Somente usuários autenticados podem acessar esta área') {
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: var(--bg-secondary); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; max-width: 500px;">
                <div style="font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3;">🔒</div>
                <h1 style="font-size: 1.8rem; color: var(--text-primary); margin-bottom: 1rem; font-weight: 700;">NÃO AUTORIZADO</h1>
                <p style="color: var(--text-secondary); margin-bottom: 2.5rem; line-height: 1.6; font-size: 1rem;">${mensagem}</p>
                <button onclick="voltarParaLogin()" style="padding: 1rem 2.5rem; background: var(--primary); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                    Ir para o Login
                </button>
            </div>
        </div>
    `;
}

function voltarParaLogin() {
    window.location.href = PORTAL_URL;
}

// ==========================================
// ======== FUNÇÕES DA APLICAÇÃO ============
// ==========================================

function generateHash(data) { 
    return JSON.stringify(data); 
}

function startRealtimeSync() {
    setInterval(async () => {
        if (isOnline) await checkForUpdates();
    }, POLLING_INTERVAL);
    
    // Atualiza os tempos relativos a cada 30 segundos
    setInterval(() => {
        if (precos.length > 0) {
            filterPrecos();
        }
    }, 30000);
}

async function checkForUpdates() {
    try {
        const response = await fetch(`${API_URL}/precos`, { 
            cache: 'no-cache', 
            headers: { 
                'Cache-Control': 'no-cache', 
                'Pragma': 'no-cache',
                'X-Session-Token': sessionToken
            } 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) return;
        
        const serverData = await response.json();
        const newHash = generateHash(serverData);
        if (newHash !== lastDataHash) {
            lastDataHash = newHash;
            precos = serverData;
            atualizarMarcasDisponiveis();
            renderMarcasFilter();
            filterPrecos();
        }
    } catch (error) { 
        console.error('Erro ao verificar atualizações:', error); 
    }
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_URL}/precos`, { 
            method: 'HEAD', 
            cache: 'no-cache',
            headers: {
                'X-Session-Token': sessionToken
            }
        });
        isOnline = response.ok;
        updateConnectionStatus();
        return isOnline;
    } catch (error) { 
        console.error('Erro ao verificar status do servidor:', error);
        isOnline = false; 
        updateConnectionStatus(); 
        return false; 
    }
}

function updateConnectionStatus() {
    const statusDiv = document.getElementById('connectionStatus');
    if (!statusDiv) return;

    if (isOnline) {
        statusDiv.className = 'connection-status online';
        statusDiv.querySelector('span:last-child').textContent = 'Online';
    } else {
        statusDiv.className = 'connection-status offline';
        statusDiv.querySelector('span:last-child').textContent = 'Offline';
    }
}

async function loadPrecos() {
    console.log('Carregando preços...');
    const serverOnline = await checkServerStatus();
    console.log('Servidor online:', serverOnline);
    
    try {
        if (serverOnline) {
            const response = await fetch(`${API_URL}/precos`, {
                headers: {
                    'X-Session-Token': sessionToken
                }
            });
            console.log('Response status:', response.status);

            if (response.status === 401) {
                sessionStorage.removeItem('tabelaPrecosSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            
            precos = await response.json();
            console.log('Preços carregados:', precos.length);
            lastDataHash = generateHash(precos);
        } else { 
            precos = [];
            console.log('Servidor offline, lista vazia');
        }
        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
    } catch (error) { 
        console.error('Erro ao carregar preços:', error); 
        showMessage('Erro ao conectar com o servidor: ' + error.message, 'error');
        precos = []; 
        filterPrecos(); 
    }
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

    container.innerHTML = '';
    const btnTodas = document.createElement('button');
    btnTodas.className = 'brand-button' + (marcaSelecionada === 'TODAS' ? ' active' : '');
    btnTodas.textContent = 'TODAS';
    btnTodas.onclick = () => selecionarMarca('TODAS');
    container.appendChild(btnTodas);

    Array.from(marcasDisponiveis).sort().forEach(marca => {
        const btn = document.createElement('button');
        btn.className = 'brand-button' + (marcaSelecionada === marca ? ' active' : '');
        btn.textContent = marca;
        btn.onclick = () => selecionarMarca(marca);
        container.appendChild(btn);
    });
}

function selecionarMarca(marca) {
    marcaSelecionada = marca;
    renderMarcasFilter();
    filterPrecos();
}

function getFormData() {
    return {
        marca: document.getElementById('marca').value.trim(),
        codigo: document.getElementById('codigo').value.trim(),
        preco: parseFloat(document.getElementById('preco').value),
        descricao: document.getElementById('descricao').value.trim()
    };
}

function toggleForm() {
    showFormModal();
}

async function syncWithServer(formData, editId, tempId) {
    const serverOnline = await checkServerStatus();
    if (!serverOnline) {
        console.log('Servidor offline. Sincronização pendente.');
        showMessage('Salvo localmente (servidor offline)', 'info');
        return;
    }

    try {
        let url, method;
        if (editId) { 
            url = `${API_URL}/precos/${editId}`; 
            method = 'PUT'; 
        } else { 
            url = `${API_URL}/precos`; 
            method = 'POST'; 
        }

        console.log(`Sincronizando: ${method} ${url}`);

        const response = await fetch(url, { 
            method, 
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            }, 
            body: JSON.stringify(formData) 
        });

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        
        const savedData = await response.json();
        console.log('Dados salvos:', savedData);

        // Atualiza com os dados reais do servidor
        if (editId) {
            const index = precos.findIndex(p => p.id === editId);
            if (index !== -1) precos[index] = savedData;
        } else {
            const tempIndex = precos.findIndex(p => p.id === tempId);
            if (tempIndex !== -1) {
                precos[tempIndex] = savedData;
            }
        }

        lastDataHash = generateHash(precos);
        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
    } catch (error) {
        console.error('Erro ao sincronizar:', error);
        // Remove o registro temporário em caso de erro
        if (!editId) {
            precos = precos.filter(p => p.id !== tempId);
            filterPrecos();
        }
        showMessage('Erro ao salvar no servidor: ' + error.message, 'error');
    }
}

window.editPreco = function(id) {
    showFormModal(id);
};

window.deletePreco = async function(id) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
        {
            title: 'Excluir Registro',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            type: 'warning'
        }
    );

    if (!confirmed) return;

    const deletedPreco = precos.find(p => p.id === id);
    precos = precos.filter(p => p.id !== id);
    atualizarMarcasDisponiveis();
    renderMarcasFilter();
    filterPrecos();
    showMessage('Registro excluído!', 'success');

    syncDeleteWithServer(id, deletedPreco);
};

async function syncDeleteWithServer(id, deletedPreco) {
    const serverOnline = await checkServerStatus();
    if (!serverOnline) {
        console.log('Servidor offline. Exclusão pendente.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/precos/${id}`, { 
            method: 'DELETE',
            headers: {
                'X-Session-Token': sessionToken
            }
        });

        if (response.status === 401) {
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) throw new Error('Erro ao deletar');

        lastDataHash = generateHash(precos);
    } catch (error) {
        console.error('Erro ao sincronizar exclusão:', error);
        if (deletedPreco) {
            precos.push(deletedPreco);
            atualizarMarcasDisponiveis();
            renderMarcasFilter();
            filterPrecos();
            showMessage('Erro ao excluir no servidor', 'error');
        }
    }
}

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

    // Ordena por marca e depois por código
    filtered.sort((a, b) => {
        const marcaCompare = a.marca.localeCompare(b.marca);
        if (marcaCompare !== 0) return marcaCompare;
        return a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' });
    });

    renderPrecos(filtered);
}

function getTimeAgo(timestamp) {
    if (!timestamp) return 'Sem data';
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s atrás`;
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}min atrás`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h atrás`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d atrás`;
    
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
                        <th>Última alteração</th>
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
    const messageDiv = document.getElementById('statusMessage');
    if (!messageDiv) return;
    
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}
