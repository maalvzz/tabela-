require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3002;

// ==========================================
// ======== CONFIGURAÇÃO DO SUPABASE ========
// ==========================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente SUPABASE não configuradas!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token'],
  credentials: true
}));

app.options('*', cors());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
async function verificarAutenticacao(req, res, next) {
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  const sessionToken = req.headers['x-session-token'] || 
                      req.query.sessionToken || 
                      req.body?.sessionToken;

  console.log('🔑 Token recebido:', sessionToken ? `${sessionToken.substring(0, 20)}...` : 'NENHUM');

  if (!sessionToken) {
    console.log('❌ Token não encontrado na requisição');
    return res.status(401).json({
      error: 'Não autenticado',
      message: 'Token de sessão não encontrado',
      redirectToLogin: true
    });
  }

  try {
    const { data: session, error } = await supabase
      .from('active_sessions')
      .select(`
        *,
        users:user_id (
          id,
          username,
          name,
          is_admin,
          is_active
        )
      `)
      .eq('session_token', sessionToken)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar sessão:', error);
      return res.status(500).json({
        error: 'Erro ao verificar sessão',
        message: error.message
      });
    }

    if (!session) {
      console.log('❌ Sessão não encontrada ou inválida');
      return res.status(401).json({
        error: 'Sessão inválida',
        message: 'Sua sessão expirou ou foi invalidada',
        redirectToLogin: true
      });
    }

    console.log('✅ Sessão válida para usuário:', session.users.username);

    if (!session.users.is_active) {
      console.log('❌ Usuário inativo:', session.users.username);
      return res.status(401).json({
        error: 'Usuário inativo',
        message: 'Sua conta foi desativada',
        redirectToLogin: true
      });
    }

    if (new Date(session.expires_at) < new Date()) {
      console.log('❌ Sessão expirada');
      await supabase
        .from('active_sessions')
        .update({ is_active: false })
        .eq('session_token', sessionToken);

      return res.status(401).json({
        error: 'Sessão expirada',
        message: 'Sua sessão expirou. Faça login novamente',
        redirectToLogin: true
      });
    }

    if (!session.users.is_admin) {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dayOfWeek = brasiliaTime.getDay();
      const hour = brasiliaTime.getHours();
      const isBusinessHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour < 18;

      if (!isBusinessHours) {
        console.log('⏰ Fora do horário comercial');
        return res.status(403).json({
          error: 'Fora do horário comercial',
          message: 'Acesso permitido apenas de segunda a sexta, das 8h às 18h (horário de Brasília)',
          redirectToLogin: true
        });
      }
    }

    supabase
      .from('active_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', sessionToken)
      .then(() => {})
      .catch(err => console.error('Erro ao atualizar atividade:', err));

    req.user = session.users;
    req.sessionToken = sessionToken;

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
// ======== ROTAS ============================
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/api', verificarAutenticacao);

app.head('/api/precos', (req, res) => {
  console.log('✅ HEAD /api/precos - Status OK');
  res.status(200).end();
});

app.get('/api/precos', async (req, res) => {
  console.log('📋 GET /api/precos - Listando preços');
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .order('marca', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar preços:', error);
      throw error;
    }
    
    console.log(`✅ ${data?.length || 0} preços encontrados`);
    res.json(data || []);
  } catch (error) {
    console.error('❌ Erro ao buscar preços:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/precos/:id', async (req, res) => {
  console.log('🔍 GET /api/precos/:id - Buscando preço ID:', req.params.id);
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;
    if (!data) {
      console.log('❌ Preço não encontrado');
      return res.status(404).json({ error: 'Preço não encontrado' });
    }

    console.log('✅ Preço encontrado');
    res.json(data);
  } catch (error) {
    console.error('❌ Erro ao buscar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/precos', async (req, res) => {
  console.log('➕ POST /api/precos - Criando novo preço');
  try {
    const { marca, codigo, preco, descricao } = req.body;

    if (!marca || !codigo || !preco || !descricao) {
      console.log('❌ Campos obrigatórios ausentes');
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
      console.error('❌ Erro ao criar preço:', error);
      throw error;
    }
    
    console.log('✅ Preço criado com sucesso:', data.id);
    res.status(201).json(data);
  } catch (error) {
    console.error('❌ Erro ao criar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/precos/:id', async (req, res) => {
  console.log('✏️ PUT /api/precos/:id - Atualizando preço ID:', req.params.id);
  try {
    const { marca, codigo, preco, descricao } = req.body;

    if (!marca || !codigo || !preco || !descricao) {
      console.log('❌ Campos obrigatórios ausentes');
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
      console.error('❌ Erro ao atualizar preço:', error);
      throw error;
    }
    
    if (!data) {
      console.log('❌ Preço não encontrado');
      return res.status(404).json({ error: 'Preço não encontrado' });
    }

    console.log('✅ Preço atualizado com sucesso');
    res.json(data);
  } catch (error) {
    console.error('❌ Erro ao atualizar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/precos/:id', async (req, res) => {
  console.log('🗑️ DELETE /api/precos/:id - Excluindo preço ID:', req.params.id);
  try {
    const { error } = await supabase
      .from('precos')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      console.error('❌ Erro ao deletar preço:', error);
      throw error;
    }
    
    console.log('✅ Preço excluído com sucesso');
    res.status(204).send();
  } catch (error) {
    console.error('❌ Erro ao deletar preço:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  console.log('💚 Health check');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured ✅' : 'not configured ❌',
    node_version: process.version
  });
});

app.use((req, res) => {
  console.log('❌ Rota não encontrada:', req.method, req.path);
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: err.message 
  });
});

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Servidor Tabela de Preços rodando na porta ${PORT}`);
  console.log(`🌐 URL: https://tabela-precos-udyp.onrender.com`);
  console.log(`💾 Supabase: ${supabaseUrl}`);
  console.log(`🔐 Autenticação: Ativa ✅`);
  console.log(`⏰ Horário comercial: Seg-Sex, 8h-18h (Brasília)`);
  console.log(`📁 Arquivos estáticos: ${path.join(__dirname, 'public')}`);
  console.log('='.repeat(60));
});

process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});
