// ==========================================
// ======== CONFIGURAÇÃO ====================
// ==========================================
const API_URL = 'https://tabela-precos-udyp.onrender.com/api';
const PORTAL_URL = 'https://ir-comercio-portal-zcan.onrender.com';
const POLLING_INTERVAL = 5000;
const SESSION_CHECK_INTERVAL = 60000;

let precos = [];
let isOnline = false;
let marcaSelecionada = 'TODAS';
let marcasDisponiveis = new Set();
let lastDataHash = '';
let sessionToken = null;
let sessionCheckInterval = null;
let connectionCheckInterval = null;

console.log('🚀 Aplicação iniciada');
console.log('📡 API URL:', API_URL);
console.log('🔐 Portal URL:', PORTAL_URL);

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM carregado, iniciando verificação de autenticação...');
    verificarAutenticacao();
});

// ==========================================
// ======== VERIFICAR AUTENTICAÇÃO ==========
// ==========================================
function verificarAutenticacao() {
    console.log('🔍 Verificando autenticação...');
    
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('sessionToken');

    if (tokenFromUrl) {
        console.log('✅ Token encontrado na URL');
        sessionToken = tokenFromUrl;
        sessionStorage.setItem('tabelaPrecosSession', sessionToken);
        
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log('🧹 URL limpa (token salvo no storage)');
    } else {
        sessionToken = sessionStorage.getItem('tabelaPrecosSession');
        
        if (sessionToken) {
            console.log('✅ Token recuperado do sessionStorage');
        } else {
            console.log('❌ Nenhum token encontrado');
        }
    }

    if (!sessionToken) {
        console.log('⛔ Sem token - redirecionando para acesso negado');
        mostrarTelaAcessoNegado();
        return;
    }

    console.log('🔑 Token disponível:', sessionToken.substring(0, 20) + '...');
    verificarSessaoValida();
}

async function verificarSessaoValida() {
    console.log('🔐 Validando sessão no portal central...');
    
    try {
        const response = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionToken })
        });

        console.log('📊 Resposta do portal:', response.status);

        if (!response.ok) {
            console.error('❌ Sessão inválida - status:', response.status);
            const data = await response.json().catch(() => ({}));
            console.error('❌ Erro:', data);
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado(data.message || 'Sessão inválida');
            return;
        }

        const data = await response.json();
        console.log('✅ Dados da sessão:', data);

        if (!data.valid) {
            console.error('❌ Sessão marcada como inválida');
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado(data.message || 'Sessão inválida');
            return;
        }

        console.log('✅ Sessão válida! Usuário:', data.session?.username);
        iniciarAplicacao();
    } catch (error) {
        console.error('❌ Erro ao verificar sessão:', error);
        mostrarTelaAcessoNegado('Erro ao verificar autenticação: ' + error.message);
    }
}

function iniciarAplicacao() {
    console.log('🎉 Iniciando aplicação...');
    loadPrecos();
    startRealtimeSync();
    startSessionCheck();
    startConnectionMonitor();
    console.log('✅ Aplicação iniciada com sucesso');
}

// ==========================================
// ======== MONITORAMENTO ===================
// ==========================================
function startConnectionMonitor() {
    console.log('📡 Iniciando monitor de conexão...');
    checkServerStatus();
    
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        checkServerStatus();
    }, 10000);
}

function startSessionCheck() {
    console.log('⏰ Iniciando verificação periódica de sessão...');
    
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
                console.error('❌ Sessão expirou durante verificação periódica');
                clearInterval(sessionCheckInterval);
                clearInterval(connectionCheckInterval);
                sessionStorage.removeItem('tabelaPrecosSession');
                mostrarTelaAcessoNegado('Sua sessão expirou');
            }
        } catch (error) {
            console.error('❌ Erro ao verificar sessão:', error);
        }
    }, SESSION_CHECK_INTERVAL);
}

// ==========================================
// ======== TELA DE ACESSO NEGADO ===========
// ==========================================
function mostrarTelaAcessoNegado(mensagem = 'Acesso não autorizado') {
    console.log('🚫 Mostrando tela de acesso negado:', mensagem);
    
    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); font-family: 'Inter', sans-serif;">
            <div style="text-align: center; padding: 3rem; background: #2a2a2a; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 500px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
                <h1 style="font-size: 1.8rem; color: #ffffff; margin-bottom: 1rem; font-weight: 700;">Acesso Restrito</h1>
                <p style="color: #a0a0a0; margin-bottom: 2rem; line-height: 1.6;">${mensagem}</p>
                <button onclick="voltarParaLogin()" style="padding: 1rem 2rem; background: linear-gradient(135deg, #CC7000 0%, #E68A00 100%); color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 8px 24px rgba(204, 112, 0, 0.4); transition: all 0.3s ease;">
                    🔐 Voltar para o Login
                </button>
            </div>
        </div>
    `;
}

function voltarParaLogin() {
    console.log('🔙 Redirecionando para o portal de login...');
    sessionStorage.removeItem('tabelaPrecosSession');
    window.location.href = PORTAL_URL;
}

// ==========================================
// ======== FUNÇÕES DA APLICAÇÃO ============
// ==========================================
function generateHash(data) { 
    return JSON.stringify(data); 
}

function startRealtimeSync() {
    console.log('🔄 Iniciando sincronização em tempo real...');
    
    setInterval(async () => {
        if (isOnline) {
            await checkForUpdates();
        }
    }, POLLING_INTERVAL);
    
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
            console.error('❌ Token inválido durante atualização');
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            console.error('❌ Erro ao buscar atualizações:', response.status);
            return;
        }
        
        const serverData = await response.json();
        const newHash = generateHash(serverData);
        
        if (newHash !== lastDataHash) {
            console.log('🔄 Dados atualizados detectados');
            lastDataHash = newHash;
            precos = serverData;
            atualizarMarcasDisponiveis();
            renderMarcasFilter();
            filterPrecos();
        }
    } catch (error) { 
        console.error('❌ Erro ao verificar atualizações:', error);
    }
}

async function checkServerStatus() {
    try {
        console.log('🔍 Verificando status do servidor...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_URL}/precos`, { 
            method: 'HEAD',
            cache: 'no-cache',
            headers: {
                'X-Session-Token': sessionToken
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const wasOnline = isOnline;
        isOnline = response.ok;
        
        if (wasOnline !== isOnline) {
            console.log(`📡 Status do servidor mudou: ${isOnline ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
        }
        
        updateConnectionStatus();
        return isOnline;
    } catch (error) { 
        if (error.name === 'AbortError') {
            console.error('⏱️ Timeout ao verificar servidor');
        } else {
            console.error('❌ Erro ao verificar status do servidor:', error.message);
        }
        
        const wasOnline = isOnline;
        isOnline = false;
        
        if (wasOnline !== isOnline) {
            console.log('📡 Servidor OFFLINE ❌');
        }
        
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
    console.log('📥 Carregando preços...');
    
    const serverOnline = await checkServerStatus();
    console.log(`📡 Servidor: ${serverOnline ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
    
    try {
        if (!serverOnline) {
            console.log('⚠️ Servidor offline - não é possível carregar preços');
            showMessage('Servidor offline. Tente novamente mais tarde.', 'error');
            renderPrecos([]);
            return;
        }

        console.log('🌐 Fazendo requisição para:', `${API_URL}/precos`);
        
        const response = await fetch(`${API_URL}/precos`, {
            headers: {
                'X-Session-Token': sessionToken,
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('📊 Response status:', response.status);
        
        if (response.status === 401) {
            console.error('❌ Não autorizado ao carregar preços');
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        precos = await response.json();
        console.log(`✅ ${precos.length} preços carregados`);
        
        lastDataHash = generateHash(precos);
        atualizarMarcasDisponiveis();
        renderMarcasFilter();
        filterPrecos();
        
    } catch (error) {
        console.error('❌ Erro ao carregar preços:', error);
        showMessage('Erro ao carregar preços: ' + error.message, 'error');
        renderPrecos([]);
    }
}

function atualizarMarcasDisponiveis() {
    marcasDisponiveis.clear();
    precos.forEach(p => marcasDisponiveis.add(p.marca));
    console.log('🏷️ Marcas disponíveis:', Array.from(marcasDisponiveis).join(', '));
}

function renderMarcasFilter() {
    const container = document.getElementById('marcasFilter');
    if (!container) return;
    
    const marcasOrdenadas = ['TODAS', ...Array.from(marcasDisponiveis).sort()];
    
    container.innerHTML = marcasOrdenadas.map(marca => `
        <button 
            class="brand-button ${marca === marcaSelecionada ? 'active' : ''}" 
            onclick="selecionarMarca('${marca}')"
        >
            ${marca}
        </button>
    `).join('');
}

function selecionarMarca(marca) {
    console.log('🏷️ Marca selecionada:', marca);
    marcaSelecionada = marca;
    renderMarcasFilter();
    filterPrecos();
}

async function handleSubmit(event) {
    event.preventDefault();
    console.log('💾 Salvando registro...');
    
    const editId = document.getElementById('editId').value;
    const formData = {
        marca: document.getElementById('marca').value,
        codigo: document.getElementById('codigo').value,
        preco: document.getElementById('preco').value,
        descricao: document.getElementById('descricao').value
    };

    console.log('📝 Dados do formulário:', formData);

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Salvando...</span>';

    const tempId = 'temp_' + Date.now();
    const tempPreco = {
        id: editId || tempId,
        ...formData,
        timestamp: new Date().toISOString()
    };

    if (editId) {
        const index = precos.findIndex(p => p.id === editId);
        if (index !== -1) precos[index] = tempPreco;
    } else {
        precos.unshift(tempPreco);
    }

    atualizarMarcasDisponiveis();
    renderMarcasFilter();
    filterPrecos();
    resetForm();
    toggleForm();
    showMessage(editId ? 'Registro atualizado!' : 'Registro criado!', 'success');

    await syncWithServer(formData, editId, tempId);

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span id="submitText">Salvar Registro</span>';
}

async function syncWithServer(formData, editId, tempId) {
    const serverOnline = await checkServerStatus();
    
    if (!serverOnline) {
        console.log('⚠️ Servidor offline - alteração pendente');
        showMessage('Servidor offline. Alteração será sincronizada quando possível.', 'info');
        return;
    }

    try {
        let url, method;
        
        if (editId) {
            url = `${API_URL}/precos/${editId}`;
            method = 'PUT';
            console.log('✏️ Atualizando registro:', editId);
        } else {
            url = `${API_URL}/precos`;
            method = 'POST';
            console.log('➕ Criando novo registro');
        }

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Token': sessionToken
            },
            body: JSON.stringify(formData)
        });

        if (response.status === 401) {
            console.error('❌ Não autorizado ao salvar');
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const savedData = await response.json();
        console.log('✅ Registro salvo no servidor:', savedData.id);

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
        console.error('❌ Erro ao sincronizar:', error);
        
        if (!editId) {
            precos = precos.filter(p => p.id !== tempId);
            filterPrecos();
        }
        
        showMessage('Erro ao salvar no servidor: ' + error.message, 'error');
    }
}

function toggleForm() {
    const formCard = document.getElementById('formCard');
    formCard.classList.toggle('hidden');
    if (!formCard.classList.contains('hidden')) {
        document.getElementById('marca').focus();
    }
}

function resetForm() {
    document.getElementById('precoForm').reset();
    document.getElementById('editId').value = '';
    document.getElementById('formTitle').textContent = 'Novo Registro';
    document.getElementById('submitText').textContent = 'Salvar Registro';
    document.getElementById('cancelBtn').classList.add('hidden');
}

function cancelEdit() {
    resetForm();
    toggleForm();
}

function editPreco(id) {
    console.log('✏️ Editando registro:', id);
    
    const preco = precos.find(p => p.id === id);
    if (!preco) {
        console.error('❌ Registro não encontrado:', id);
        return;
    }

    document.getElementById('editId').value = preco.id;
    document.getElementById('marca').value = preco.marca;
    document.getElementById('codigo').value = preco.codigo;
    document.getElementById('preco').value = preco.preco;
    document.getElementById('descricao').value = preco.descricao;

    document.getElementById('formTitle').textContent = 'Editar Registro';
    document.getElementById('submitText').textContent = 'Atualizar Registro';
    document.getElementById('cancelBtn').classList.remove('hidden');
    document.getElementById('formCard').classList.remove('hidden');
    document.getElementById('marca').focus();
}

async function deletePreco(id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    console.log('🗑️ Excluindo registro:', id);

    const deletedPreco = precos.find(p => p.id === id);
    precos = precos.filter(p => p.id !== id);
    atualizarMarcasDisponiveis();
    renderMarcasFilter();
    filterPrecos();
    showMessage('Registro excluído!', 'success');

    await syncDeleteWithServer(id, deletedPreco);
}

async function syncDeleteWithServer(id, deletedPreco) {
    const serverOnline = await checkServerStatus();
    
    if (!serverOnline) {
        console.log('⚠️ Servidor offline - exclusão pendente');
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
            console.error('❌ Não autorizado ao excluir');
            sessionStorage.removeItem('tabelaPrecosSession');
            mostrarTelaAcessoNegado('Sua sessão expirou');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Registro excluído no servidor');
        lastDataHash = generateHash(precos);
        
    } catch (error) {
        console.error('❌ Erro ao sincronizar exclusão:', error);
        
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
    const searchTerm = document.getElementById('search')?.value.toLowerCase() || '';
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
    
    if (!container) {
        console.error('❌ Container de preços não encontrado');
        return;
    }
    
    if (!precosToRender || precosToRender.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
                <p style="font-size: 1.1rem;">Nenhum registro encontrado</p>
            </div>
        `;
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
                            <td><strong>R$ ${parseFloat(p.preco).toFixed(2)}</strong></td>
                            <td>${p.descricao}</td>
                            <td style="color: var(--text-secondary); font-size: 0.85rem;">${getTimeAgo(p.timestamp)}</td>
                            <td class="actions-cell" style="text-align: center;">
                                <button onclick="editPreco('${p.id}')" class="action-btn edit" title="Editar">✏️ Editar</button>
                                <button onclick="deletePreco('${p.id}')" class="action-btn delete" title="Excluir">🗑️ Excluir</button>
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
    console.log(`📢 Mensagem [${type}]:`, message);
    
    const messageDiv = document.getElementById('statusMessage');
    if (!messageDiv) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    
    messageDiv.innerHTML = `${icons[type] || ''} ${message}`;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}

window.verificarAutenticacao = verificarAutenticacao;
window.voltarParaLogin = voltarParaLogin;
window.toggleForm = toggleForm;
window.handleSubmit = handleSubmit;
window.cancelEdit = cancelEdit;
window.editPreco = editPreco;
window.deletePreco = deletePreco;
window.filterPrecos = filterPrecos;
window.selecionarMarca = selecionarMarca;

console.log('✅ Script carregado completamente');
