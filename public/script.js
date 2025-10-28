const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3002/api'
    : `${window.location.origin}/api`;

const POLLING_INTERVAL = 3000;

let precos = [];
let isOnline = false;
let marcaSelecionada = 'TODAS';
let marcasDisponiveis = new Set();
let lastDataHash = '';

console.log('API URL configurada:', API_URL);

document.addEventListener('DOMContentLoaded', () => {
    loadPrecos();
    startRealtimeSync();
});

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
                'Pragma': 'no-cache' 
            } 
        });
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
            cache: 'no-cache' 
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
            const response = await fetch(`${API_URL}/precos`);
            console.log('Response status:', response.status);
            
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

async function handleSubmit(event) {
    event.preventDefault();

    const formData = getFormData();
    const editId = document.getElementById('editId').value;

    const codigoDuplicado = precos.find(p => 
        p.codigo.toLowerCase() === formData.codigo.toLowerCase() && p.id !== editId
    );

    if (codigoDuplicado) {
        showMessage(`Erro: O código "${formData.codigo}" já está cadastrado`, 'error');
        document.getElementById('codigo').focus();
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
    resetForm();
    toggleForm();

    // Sincronização em segundo plano
    syncWithServer(formData, editId, tempId);
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
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(formData) 
        });
        
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
    const preco = precos.find(p => p.id === id);
    if (!preco) return;

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

    const deletedPreco = precos.find(p => p.id === id);
    precos = precos.filter(p => p.id !== id);
    atualizarMarcasDisponiveis();
    renderMarcasFilter();
    filterPrecos();
    showMessage('Registro excluído!', 'success');

    syncDeleteWithServer(id, deletedPreco);
}

async function syncDeleteWithServer(id, deletedPreco) {
    const serverOnline = await checkServerStatus();
    if (!serverOnline) {
        console.log('Servidor offline. Exclusão pendente.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/precos/${id}`, { method: 'DELETE' });
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
                                <button onclick="editPreco('${p.id}')" class="action-btn edit">Editar</button>
                                <button onclick="deletePreco('${p.id}')" class="action-btn delete">Excluir</button>
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
    messageDiv.textContent = message;
    messageDiv.className = `status-message ${type}`;
    messageDiv.classList.remove('hidden');
    
    setTimeout(() => {
        messageDiv.classList.add('hidden');
    }, 5000);
}
