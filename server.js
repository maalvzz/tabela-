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
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================
// ======== MIDDLEWARES GERAIS ==============
// ==========================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ======== MIDDLEWARE DE AUTENTICAÇÃO ======
// ==========================================
async function verificarAutenticacao(req, res, next) {
  // Permitir acesso livre à página inicial e health check
  if (req.path === '/' || req.path === '/health') {
    return next();
  }

  // Pegar token da sessão
  const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;

  if (!sessionToken) {
    return res.status(401).json({
      error: 'Não autenticado',
      message: 'Token de sessão não encontrado',
      redirectToLogin: true
    });
  }

  try {
    // Verificar se a sessão é válida
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
      .single();

    if (error || !session) {
      return res.status(401).json({
        error: 'Sessão inválida',
        message: 'Sua sessão expirou ou foi invalidada',
        redirectToLogin: true
      });
    }

    // Verificar se o usuário está ativo
    if (!session.users.is_active) {
      return res.status(401).json({
        error: 'Usuário inativo',
        message: 'Sua conta foi desativada',
        redirectToLogin: true
      });
    }

    // Verificar se a sessão não expirou
    if (new Date(session.expires_at) < new Date()) {
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

    // Verificar horário comercial para não-admin
    if (!session.users.is_admin) {
      const now = new Date();
      const brasiliaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const dayOfWeek = brasiliaTime.getDay();
      const hour = brasiliaTime.getHours();
      const isBusinessHours = dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 8 && hour < 18;

      if (!isBusinessHours) {
        return res.status(403).json({
          error: 'Fora do horário comercial',
          message: 'Acesso permitido apenas de segunda a sexta, das 8h às 18h (horário de Brasília)',
          redirectToLogin: true
        });
      }
    }

    // Atualizar última atividade
    await supabase
      .from('active_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', sessionToken);

    // Adicionar informações do usuário na requisição
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

// Aplicar autenticação em todas as rotas da API
app.use('/api', verificarAutenticacao);

app.head('/api/precos', (req, res) => res.status(200).end());

app.get('/api/precos', async (req, res) => {
  try {
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
    supabase: supabaseUrl ? 'configured' : 'not configured'
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
  console.log(`==> URL principal: https://tabela-precos-3yg9.onrender.com`);
  console.log(`==> Supabase URL: ${supabaseUrl}`);
  console.log(`==> Autenticação: Ativa ✅`);
  console.log(`==> Filtro de IP: Removido ✅`);
});
