const express = require('express');
const { validatePet } = require('./validation');

function createPetRouter(database, requireAccount) {
  const router = express.Router();
  router.get('/breeds', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const { data, error } = await database.from('pet_breeds').select('id,species,name')
      .eq('active', true).order('species').order('name');
    if (error) return res.status(503).json({ error: 'El catálogo de razas no está disponible. Puedes elegir Otra o reintentar.' });
    res.json(data);
  });
  router.use(requireAccount);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/', async (req, res) => {
    const { data, error } = await database.from('pets').select('*').eq('id_owner', req.account.id).order('created_at', { ascending: false });
    if (error) return res.status(503).json({ error: 'No se pudieron cargar tus mascotas.' });
    res.json(data);
  });

  router.post('/', async (req, res) => {
    const payload = await petPayload(req.body, false, res);
    if (!payload) return;
    const { data, error } = await database.from('pets').insert([{
      ...payload, id_owner: req.account.id,
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
    const payload = await petPayload(req.body, true, res);
    if (!payload) return;
    const { data, error } = await database.from('pets').update(payload)
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
  async function petPayload(input, partial, res) {
    const { data, breedId, errors } = validatePet(input, partial);
    if (Object.keys(errors).length) {
      res.status(400).json({ error: 'Revisa los datos de tu mascota.', errors });
      return null;
    }
    if (breedId) {
      const result = await database.from('pet_breeds').select('name').eq('id', breedId).eq('active', true).maybeSingle();
      if (result.error) { res.status(503).json({ error: 'No se pudo consultar la raza. Reintenta o elige Otra.' }); return null; }
      if (!result.data) { res.status(400).json({ error: 'Revisa la raza seleccionada.', errors: { breed: 'Esta raza ya no está disponible. Elige otra opción.' } }); return null; }
      data.breed = result.data.name;
    }
    return data;
  }
  return router;
}

module.exports = { createPetRouter };
