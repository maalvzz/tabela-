const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// ConfiguraÃ§Ã£o do Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rota raiz
app.get('/', (req, res) => {
  res.send('API de Preços funcionando!');
});

// GET - Listar todos os preÃ§os
app.get('/precos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('precos')
      .select('*')
      .order('marca', { ascending: true });
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Erro ao buscar preços:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET - Buscar preÃ§o por ID
app.get('/precos/:id', async (req, res) => {
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

// POST - Criar novo preÃ§o
app.post('/precos', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;
    
    const { data, error } = await supabase
      .from('precos')
      .insert([{
        marca,
        codigo,
        preco,
        descricao,
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

// PUT - Atualizar preÃ§o
app.put('/precos/:id', async (req, res) => {
  try {
    const { marca, codigo, preco, descricao } = req.body;
    
    const { data, error } = await supabase
      .from('precos')
      .update({
        marca,
        codigo,
        preco,
        descricao,
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

// DELETE - Deletar preÃ§o
app.delete('/precos/:id', async (req, res) => {
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

// HEAD - Verificar status do servidor
app.head('/precos', (req, res) => {
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
