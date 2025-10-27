const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Configuração do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middlewares
app.use(cors({
  origin: '*', // Permite todas as origens - ajuste conforme necessário
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rota raiz - servir o HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HEAD - Verificar status do servidor
app.head('/api/precos', (req, res) => {
  res.status(200).end();
});

// GET - Listar todos os preços
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

// GET - Buscar preço por ID
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

// POST - Criar novo preço
app.post('/api/precos', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;
    
    // Validação básica
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

// PUT - Atualizar preço
app.put('/api/precos/:id', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;
    
    // Validação básica
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

// DELETE - Deletar preço
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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supabase: supabaseUrl ? 'configured' : 'not configured'
  });
});

// Tratamento de rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`==> Servidor rodando na porta ${PORT}`);
  console.log(`==> URL principal: https://tabela-precos.onrender.com`);
  console.log(`==> Supabase URL: ${supabaseUrl}`);
  console.log(`==> Supabase configurado: ${supabaseUrl ? 'Sim' : 'Não'}`);
});
