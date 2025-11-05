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
  const logEntry = `[${new Date().toISOString()}] IP: ${cleanIP} Rota: ${req.path}\n`;

  // Grava no arquivo de log
  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) console.error('Erro ao gravar log:', err);
  });
2
  next();
}

// ==========================================
// ======== FILTRO DE IPS AUTORIZADOS ========
// ==========================================
const allowedIPs = ['187.36.172.217']; // Seu IP público

app.use(registrarAcesso); // Middleware de log antes do filtro
app.use((req, res, next) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  const clientIP = xForwardedFor
    ? xForwardedFor.split(',')[0].trim()
    : req.socket.remoteAddress;

  const cleanIP = clientIP.replace('::ffff:', '');

  if (!allowedIPs.includes(cleanIP)) {
    return res.status(403).json({
      error: 'Acesso negado',
      message: `Seu IP (${cleanIP}) não tem permissão para acessar este serviço`,
    });
  }

  next();
});

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
  console.log(`==> URL principal: https://tabela-precos.onrender.com`);
  console.log(`==> Supabase URL: ${supabaseUrl}`);
  console.log(`==> Supabase configurado: ${supabaseUrl ? 'Sim' : 'Não'}`);
});
