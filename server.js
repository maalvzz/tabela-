require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3002;

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERRO: SUPABASE_URL ou SUPABASE_ANON_KEY não configurados');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✅ Supabase configurado:', supabaseUrl);

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log detalhado de requisições
app.use((req, res, next) => {
    console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==========================================
// ======== ARQUIVO DE LOG ==================
// ==========================================
const logFilePath = path.join(__dirname, 'acessos.log');

function registrarAcesso(req, res, next) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor
        ? xForwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress;

    const cleanIP = clientIP.replace('::ffff:', '');
    const logEntry = `[${new Date().toISOString()}] IP: ${cleanIP} Rota: ${req.path}\n`;

    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) console.error('Erro ao gravar log:', err);
    });

    next();
}

app.use(registrarAcesso);

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
const PORTAL_URL = process.env.PORTAL_URL || 'https://ir-comercio-portal-zcan.onrender.com';

console.log('🔐 Portal URL configurado:', PORTAL_URL);

async function verificarAutenticacao(req, res, next) {
    // Rotas públicas que NÃO precisam de autenticação
    const publicPaths = ['/', '/health', '/app'];
    if (publicPaths.includes(req.path)) {
        return next();
    }

    // Pegar token da sessão
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

    console.log('🔑 Token recebido:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'NENHUM');

    if (!sessionToken) {
        console.log('❌ Token não encontrado');
        return res.status(401).json({
            error: 'Não autenticado',
            message: 'Token de sessão não encontrado',
            redirectToLogin: true
        });
    }

    try {
        console.log('🔍 Verificando sessão no portal:', PORTAL_URL);
        
        // Verificar se a sessão é válida no Portal Central
        const verifyResponse = await fetch(`${PORTAL_URL}/api/verify-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionToken })
        });

        console.log('📊 Resposta do portal:', verifyResponse.status);

        if (!verifyResponse.ok) {
            console.log('❌ Resposta não OK do portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: 'Sua sessão expirou ou foi invalidada',
                redirectToLogin: true
            });
        }

        const sessionData = await verifyResponse.json();
        console.log('📋 Dados da sessão:', sessionData.valid ? 'VÁLIDA' : 'INVÁLIDA');

        if (!sessionData.valid) {
            console.log('❌ Sessão marcada como inválida pelo portal');
            return res.status(401).json({
                error: 'Sessão inválida',
                message: sessionData.message || 'Sua sessão expirou',
                redirectToLogin: true
            });
        }

        // Adicionar informações do usuário na requisição
        req.user = sessionData.session;
        req.sessionToken = sessionToken;

        console.log('✅ Autenticação bem-sucedida para:', sessionData.session?.username);
        next();
    } catch (error) {
        console.error('❌ Erro ao verificar autenticação:', error);
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Erro ao verificar autenticação'
        });
    }
}

// ==========================================
// ======== SERVIR ARQUIVOS ESTÁTICOS =======
// ==========================================
const publicPath = path.join(__dirname, 'public');
console.log('📁 Pasta public:', publicPath);

app.use(express.static(publicPath, {
    index: 'index.html',
    dotfiles: 'deny',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ==========================================
// ======== HEALTH CHECK (PÚBLICO) ==========
// ==========================================
app.get('/health', async (req, res) => {
    console.log('💚 Health check requisitado');
    try {
        const { error } = await supabase
            .from('precos')
            .select('count', { count: 'exact', head: true });
        
        res.json({
            status: error ? 'unhealthy' : 'healthy',
            database: error ? 'disconnected' : 'connected',
            supabase_url: supabaseUrl,
            portal_url: PORTAL_URL,
            timestamp: new Date().toISOString(),
            publicPath: publicPath,
            authentication: 'enabled'
        });
    } catch (error) {
        res.json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ==========================================
// ======== ROTAS DA API ====================
// ==========================================

// Aplicar autenticação em todas as rotas da API
app.use('/api', verificarAutenticacao);

// HEAD endpoint para verificação de status
app.head('/api/precos', (req, res) => {
    res.status(200).end();
});

// Listar todos os preços
app.get('/api/precos', async (req, res) => {
    try {
        console.log('🔍 Buscando preços...');
        const { data, error } = await supabase
            .from('precos')
            .select('*')
            .order('marca', { ascending: true });

        if (error) {
            console.error('❌ Erro ao buscar:', error);
            throw error;
        }
        
        console.log(`✅ ${data.length} preços encontrados`);
        res.json(data || []);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao buscar preços', 
            details: error.message 
        });
    }
});

// Buscar preço específico
app.get('/api/precos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('precos')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) {
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: 'Erro ao buscar preço', 
            details: error.message 
        });
    }
});

// Criar novo preço
app.post('/api/precos', async (req, res) => {
    try {
        console.log('📝 Criando preço:', req.body);
        
        const { marca, codigo, preco, descricao } = req.body;

        if (!marca || !codigo || !preco || !descricao) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('precos')
            .insert([{
                marca: marca.trim(),
                codigo: codigo.trim(),
                preco: parseFloat(preco),
                descricao: descricao.trim(),
                timestamp: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao criar:', error);
            throw error;
        }
        
        console.log('✅ Preço criado:', data.id);
        res.status(201).json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao criar preço', 
            details: error.message 
        });
    }
});

// Atualizar preço
app.put('/api/precos/:id', async (req, res) => {
    try {
        console.log('✏️ Atualizando preço:', req.params.id);
        
        const { marca, codigo, preco, descricao } = req.body;

        if (!marca || !codigo || !preco || !descricao) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const { data, error } = await supabase
            .from('precos')
            .update({
                marca: marca.trim(),
                codigo: codigo.trim(),
                preco: parseFloat(preco),
                descricao: descricao.trim(),
                timestamp: new Date().toISOString()
            })
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) {
            return res.status(404).json({ error: 'Preço não encontrado' });
        }
        
        console.log('✅ Preço atualizado');
        res.json(data);
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao atualizar preço', 
            details: error.message 
        });
    }
});

// Deletar preço
app.delete('/api/precos/:id', async (req, res) => {
    try {
        console.log('🗑️ Deletando preço:', req.params.id);
        
        const { error } = await supabase
            .from('precos')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        
        console.log('✅ Preço deletado');
        res.status(204).end();
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ 
            error: 'Erro ao excluir preço', 
            details: error.message 
        });
    }
});

// ==========================================
// ======== ROTA PRINCIPAL (PÚBLICO) ========
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
    console.log('❌ Rota não encontrada:', req.path);
    res.status(404).json({
        error: '404 - Rota não encontrada',
        path: req.path,
        availableRoutes: {
            interface: 'GET /',
            health: 'GET /health',
            api: 'GET /api/precos'
        }
    });
});

// ==========================================
// ======== TRATAMENTO DE ERROS =============
// ==========================================
app.use((error, req, res, next) => {
    console.error('💥 Erro no servidor:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
    });
});

// ==========================================
// ======== INICIAR SERVIDOR ================
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Database: Supabase`);
    console.log(`🔗 Supabase URL: ${supabaseUrl}`);
    console.log(`📁 Public folder: ${publicPath}`);
    console.log(`🔐 Autenticação: Ativa ✅`);
    console.log(`🌐 Portal URL: ${PORTAL_URL}`);
    console.log(`🔓 Rotas públicas: /, /health, /app`);
    console.log('🚀 ================================\n');
});

// Verificar se pasta public existe
if (!fs.existsSync(publicPath)) {
    console.error('⚠️ AVISO: Pasta public/ não encontrada!');
    console.error('📁 Crie a pasta e adicione os arquivos:');
    console.error('   - public/index.html');
    console.error('   - public/styles.css');
    console.error('   - public/script.js');
}
