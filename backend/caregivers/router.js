const express = require('express');
const { validateCaregiver } = require('./validation');
const { parseSearch, filterCaregivers } = require('./search');
const { readAll, enrichCaregivers } = require('./directory');

const selection = '*, profile:profiles(first_name,last_name,id_user)';

function databaseError(res, error) {
  console.error('Error de perfiles de cuidadores:', error.message);
  return res.status(500).json({ error: 'No se pudo acceder a los cuidadores. Verifica la conexión y la migración de la base de datos.' });
}

function createCaregiverRouter(supabase, requireAccount = (_req, res) => res.status(401).json({ error: 'Inicia sesión para continuar.' })) {
  const router = express.Router();
  const ownProfile = (req, res, next) => {
    if (String(req.account.profile.id) !== req.params.profileId) return res.status(403).json({ error: 'Solo puedes administrar tu propio perfil.' });
    if (!req.account.roles.includes('caregiver')) return res.status(403).json({ error: 'Esta función requiere una cuenta de cuidador.' });
    res.set('Cache-Control', 'no-store');
    next();
  };

  router.get('/', async (req, res) => {
    const { filters, errors } = parseSearch(req.query);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los filtros de búsqueda.', errors });
    try {
      const data = await readAll(() => supabase.from('caregiver_profiles').select(selection)
        .eq('status', 'published').order('id'));
      const profiles = await enrichCaregivers(supabase, data, filters);
      res.json(filterCaregivers(profiles, filters));
    } catch (error) { return databaseError(res, error); }
  });

  router.get('/profile/:profileId', requireAccount, ownProfile, async (req, res) => {
    const { data, error } = await supabase.from('caregiver_profiles').select(selection)
      .eq('profile_id', req.params.profileId).maybeSingle();
    if (error) return databaseError(res, error);
    res.json(data);
  });

  router.put('/profile/:profileId', requireAccount, ownProfile, async (req, res) => {
    const { data: payload, errors } = validateCaregiver(req.body);
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Revisa los campos del perfil.', errors });
    }
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('id').eq('id', req.params.profileId).maybeSingle();
    if (profileError) return databaseError(res, profileError);
    if (!profile) return res.status(404).json({ error: 'El perfil seleccionado no existe.' });

    const { data, error } = await supabase.from('caregiver_profiles')
      .upsert({ ...payload, profile_id: profile.id, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' })
      .select(selection).single();
    if (error) return databaseError(res, error);
    res.json(data);
  });

  router.get('/:id', async (req, res) => {
    const { data, error } = await supabase.from('caregiver_profiles').select(selection)
      .eq('id', req.params.id).eq('status', 'published').maybeSingle();
    if (error) return databaseError(res, error);
    if (!data) return res.status(404).json({ error: 'Este perfil no está publicado o no existe.' });
    try {
      const [profile] = await enrichCaregivers(supabase, [data]);
      if (!profile.active) return res.status(404).json({ error: 'Este cuidador no está activo.' });
      const { busy_bookings: _busy, ...publicProfile } = profile;
      res.json(publicProfile);
    } catch (enrichError) { return databaseError(res, enrichError); }
  });

  return router;
}

module.exports = { createCaregiverRouter };
