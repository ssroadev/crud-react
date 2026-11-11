const express = require('express');

function createPetRouter(database, requireAccount) {
  const router = express.Router();
  const sizes = ['pequeno', 'mediano', 'grande'];
  router.use(requireAccount);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/', async (req, res) => {
    const { data, error } = await database.from('pets').select('*').eq('id_owner', req.account.id).order('created_at', { ascending: false });
    if (error) return res.status(503).json({ error: 'No se pudieron cargar tus mascotas.' });
    res.json(data);
  });

  router.post('/', async (req, res) => {
    const { name, size, breed, birth_date, notes } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || !sizes.includes(size)) {
      return res.status(400).json({ error: 'Completa el nombre y selecciona un tamaño válido.' });
    }
    const { data, error } = await database.from('pets').insert([{
      id_owner: req.account.id, name: name.trim(), size, breed, birth_date, notes,
    }]).select().single();
    if (error) return res.status(400).json({ error: 'No se pudo registrar la mascota. Revisa los datos.' });
    res.status(201).json(data);
  });

  router.get('/:id', async (req, res) => {
    const { data, error } = await database.from('pets').select('*').eq('id', req.params.id).eq('id_owner', req.account.id).maybeSingle();
    if (error) return res.status(503).json({ error: 'No se pudo consultar la mascota.' });
    if (!data) return res.status(404).json({ error: 'No se encontró esa mascota en tu cuenta.' });
    res.json(data);
  });

  router.put('/:id', async (req, res) => {
    const { name, size, breed, birth_date, notes } = req.body || {};
    if ((name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 100)) ||
      (size !== undefined && !sizes.includes(size))) return res.status(400).json({ error: 'Revisa el nombre y el tamaño de la mascota.' });
    const { data, error } = await database.from('pets').update({ name: name?.trim(), size, breed, birth_date, notes })
      .eq('id', req.params.id).eq('id_owner', req.account.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: 'No se pudo actualizar la mascota.' });
    if (!data) return res.status(404).json({ error: 'No se encontró esa mascota en tu cuenta.' });
    res.json(data);
  });

  router.delete('/:id', async (req, res) => {
    const { data, error } = await database.from('pets').delete().eq('id', req.params.id).eq('id_owner', req.account.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: 'No se pudo eliminar la mascota. Revisa si tiene reservas asociadas.' });
    if (!data) return res.status(404).json({ error: 'No se encontró esa mascota en tu cuenta.' });
    res.status(204).end();
  });
  return router;
}

module.exports = { createPetRouter };
