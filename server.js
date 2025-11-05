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
const allowedIP = process.env.ALLOWED_IP || '187.36.172.217';
const supabase = createClient(supabaseUrl, supabaseKey);

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
  const logEntry = `[${new Date().toISOString()}] IP: ${cleanIP} Rota: ${req.path} Auth: ${req.query.sessionToken ? 'SIM' : 'NÃO'}\n`;

  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) console.error('Erro ao gravar log:', err);
  });

  next();
}

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(registrarAcesso);

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
async function verificarAutenticacao(req, res, next) {
  // Permitir health check e página principal sem auth
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/assets')) {
    return next();
  }

  try {
    // 1. Verificar IP
    const xForwardedFor = req.headers['x-forwarded-for'];
    const clientIP = xForwardedFor 
      ? xForwardedFor.split(',')[0].trim() 
      : req.socket.remoteAddress;
    const cleanIP = clientIP.replace('::ffff:', '');

    if (cleanIP !== allowedIP) {
      console.log('❌ IP não autorizado:', cleanIP);
      return res.status(403).json({ 
        error: 'Acesso negado', 
        message: 'IP não autorizado' 
      });
    }

    // 2. Extrair parâmetros de autenticação
    const { sessionToken, deviceToken, userId } = req.query;

    if (!sessionToken || !deviceToken || !userId) {
      console.log('❌ Parâmetros de autenticação ausentes');
      return res.status(401).json({ 
        error: 'Não autenticado', 
        message: 'Parâmetros de autenticação ausentes' 
      });
    }

    // 3. Verificar sessão no Supabase
    const { data: session, error } = await supabase
      .from('active_sessions')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('device_token', deviceToken)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (error || !session) {
      console.log('❌ Sessão inválida:', error?.message);
      return res.status(401).json({ 
        error: 'Sessão inválida', 
        message: 'Sessão não encontrada ou inativa' 
      });
    }

    // 4. Verificar expiração
    if (new Date(session.expires_at) < new Date()) {
      console.log('❌ Sessão expirada');
      return res.status(401).json({ 
        error: 'Sessão expirada', 
        message: 'Faça login novamente' 
      });
    }

    // 5. Adicionar informações do usuário à requisição
    req.user = {
      userId: session.user_id,
      sessionToken: session.session_token,
      deviceToken: session.device_token
    };

    console.log('✅ Autenticação bem-sucedida:', req.user.userId);
    next();

  } catch (error) {
    console.error('❌ Erro na autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro interno', 
      message: 'Erro ao verificar autenticação' 
    });
  }
}

// ==========================================
// ======== APLICAR AUTENTICAÇÃO ============
// ==========================================
// Todas as rotas /api/* precisam de autenticação
app.use('/api/*', verificarAutenticacao);

// ==========================================
// ======== ROTAS ============================
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.head('/api/precos', (req, res) => res.status(200).end());

app.get('/api/precos', async (req, res) => {
  try {
    console.log('📦 Buscando preços para usuário:', req.user.userId);
    
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .order('marca', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erro ao buscar preços:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/precos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Preço não encontrado' });

    res.json(data);
  } catch (error) {
    console.error('Erro ao buscar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/precos', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;

    if (!marca || !codigo || !preco || !descricao) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    console.log('➕ Criando preço - usuário:', req.user.userId);

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

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Erro ao criar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/precos/:id', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;

    if (!marca || !codigo || !preco || !descricao) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    console.log('✏️ Atualizando preço - usuário:', req.user.userId);

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

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Preço não encontrado' });

    res.json(data);
  } catch (error) {
    console.error('Erro ao atualizar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/precos/:id', async (req, res) => {
  try {
    console.log('🗑️ Deletando preço - usuário:', req.user.userId);
    
    const { error } = await supabase
      .from('precos')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao deletar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// ======== HEALTH CHECK ====================
// ==========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured' : 'not configured',
    auth: 'enabled'
  });
});

// ==========================================
// ======== ROTA 404 ========================
// ==========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ==========================================
// ======== INICIAR SERVIDOR ================
// ==========================================
app.listen(PORT, () => {
  console.log(`==> Servidor rodando na porta ${PORT}`);
  console.log(`==> Autenticação: ATIVADA`);
  console.log(`==> IP autorizado: ${allowedIP}`);
  console.log(`==> Supabase configurado: ${supabaseUrl ? 'Sim' : 'Não'}`);
});
