require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3002;

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
  const logEntry = `[${new Date().toISOString()}] IP: ${cleanIP} Rota: ${req.path} User: ${req.query.username || 'N/A'}\n`;

  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) console.error('Erro ao gravar log:', err);
  });

  next();
}

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(registrarAcesso);

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
function verificarAutenticacao(req, res, next) {
  // Permitir acesso ao index.html e arquivos estáticos
  if (req.path === '/' || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path === '/health' || req.path === '/debug') {
    return next();
  }

  // Para rotas da API, verificar parâmetros de autenticação
  if (req.path.startsWith('/api/')) {
    const { sessionToken, deviceToken, userId, username } = req.query;
    
    // Validação básica de presença dos tokens
    if (!sessionToken || !deviceToken || !userId) {
      console.log('❌ Acesso negado - Tokens ausentes:', {
        hasSession: !!sessionToken,
        hasDevice: !!deviceToken,
        hasUserId: !!userId,
        path: req.path
      });
      return res.status(401).json({
        error: 'Não autorizado',
        message: 'Tokens de autenticação ausentes ou inválidos'
      });
    }

    // Log de acesso autorizado
    console.log('✅ Acesso autorizado:', {
      user: username || userId,
      path: req.path,
      method: req.method
    });
  }

  next();
}

app.use(verificarAutenticacao);
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ======== ROTAS ============================
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.head('/api/precos', (req, res) => res.status(200).end());

app.get('/api/precos', async (req, res) => {
  try {
    console.log('📥 GET /api/precos - Buscando dados...');
    
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .order('marca', { ascending: true });

    if (error) {
      console.error('❌ Erro Supabase:', error);
      throw error;
    }
    
    console.log(`✅ Retornando ${data?.length || 0} registros para ${req.query.username || 'usuário'}`);
    res.json(data || []);
  } catch (error) {
    console.error('❌ Erro ao buscar preços:', error);
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
    console.log(`✅ Registro criado por ${req.query.username}:`, data.id);
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

    console.log(`✅ Registro atualizado por ${req.query.username}:`, data.id);
    res.json(data);
  } catch (error) {
    console.error('Erro ao atualizar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/precos/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('precos')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    console.log(`✅ Registro deletado por ${req.query.username}:`, req.params.id);
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
    supabase: supabaseUrl ? 'configured' : 'not configured'
  });
});

// ==========================================
// ======== ROTA DE DEBUG ===================
// ==========================================
app.get('/debug', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('count');
    
    res.json({
      supabaseConfigured: !!supabaseUrl,
      supabaseUrl: supabaseUrl,
      hasAnonymousKey: !!supabaseKey,
      keyPreview: supabaseKey ? `${supabaseKey.substring(0, 20)}...` : 'não configurado',
      databaseTest: error ? { error: error.message } : { success: true, count: data }
    });
  } catch (error) {
    res.json({
      error: error.message,
      supabaseConfigured: !!supabaseUrl
    });
  }
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
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 URL: https://tabela-precos.onrender.com`);
  console.log(`🔐 Autenticação: ATIVADA (via portal)`);
  console.log(`📊 Supabase URL: ${supabaseUrl || 'NÃO CONFIGURADO'}`);
  console.log(`🔑 Supabase Key: ${supabaseKey ? 'Configurado ✅' : 'NÃO CONFIGURADO ❌'}`);
  console.log(`${'='.repeat(50)}\n`);
});
