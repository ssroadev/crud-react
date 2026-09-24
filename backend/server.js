require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');

const app = express();
const PORT = process.env.PORT || 3000;
const SIZES = ['pequeno', 'mediano', 'grande']; 

app.use(cors({ origin: 'http://localhost:5173' })); 
app.use(express.json());

app.post('/pets', async (req, res) => {
  const { id_owner, name, size, breed, birth_date, notes } = req.body;
  if (!id_owner || !name || !SIZES.includes(size)) {
    return res.status(400).json({
      error: 'id_owner, name y size son obligatorios',
    });
  }
  const { data, error } = await supabase
    .from('pets')
    .insert([{ id_owner, name, size, breed, birth_date, notes }])
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/pets', async (req, res) => {
  let query = supabase.from('pets').select('*').order('created_at', { ascending: false });
  if (req.query.id_owner) query = query.eq('id_owner', req.query.id_owner);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/pets/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

app.put('/pets/:id', async (req, res) => {
  const { name, size, breed, birth_date, notes } = req.body;
  if (size !== undefined && !SIZES.includes(size)) {
    return res.status(400).json({ error: 'size debe ser pequeno, mediano o grande' });
  }
  const { data, error } = await supabase
    .from('pets')
    .update({ name, size, breed, birth_date, notes })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete('/pets/:id', async (req, res) => {
  const { error } = await supabase.from('pets').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});