const express = require('express');
const { validCoordinates } = require('../caregivers/search');

function createLocationRouter({ fetchImpl = fetch, endpoint = process.env.GEOCODING_URL || 'https://photon.komoot.io/api/', now = Date.now } = {}) {
  const router = express.Router();
  const cache = new Map();
  const pending = new Map();
  let lastRequest = -Infinity;

  router.get('/', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 3 || q.length > 160) return res.status(400).json({ error: 'Escribe una ciudad, barrio o dirección entre 3 y 160 caracteres.' });
    const key = q.toLocaleLowerCase('es');
    const cached = cache.get(key);
    if (cached && now() - cached.created < 3600000) return res.json(cached.results);
    if (!pending.has(key)) {
      if (now() - lastRequest < 1000) return res.status(429).json({ error: 'Espera un segundo antes de buscar otra ubicación.' });
      lastRequest = now();
      const lookup = async () => {
        const url = new URL(endpoint);
        url.searchParams.set('q', q);
        url.searchParams.set('limit', '5');
        const response = await fetchImpl(url, {
          headers: { 'Accept-Language': 'es', 'User-Agent': 'PawHub/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) throw new Error('Geocoding unavailable');
        const body = await response.json();
        if (!Array.isArray(body.features)) throw new Error('Invalid geocoding response');
        const results = body.features.flatMap((feature) => {
          const [longitude, latitude] = feature.geometry?.coordinates || [];
          if (typeof latitude !== 'number' || typeof longitude !== 'number' || !validCoordinates(latitude, longitude)) return [];
          const props = feature.properties || {};
          const label = [...new Set([props.name, props.street, props.city, props.county, props.state, props.country].filter((value) => typeof value === 'string' && value))].join(', ').slice(0, 300);
          return [{ latitude, longitude, label: label || `${latitude}, ${longitude}` }];
        }).slice(0, 5);
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(key, { created: now(), results });
        return results;
      };
      pending.set(key, lookup());
    }
    try { res.json(await pending.get(key)); }
    catch { res.status(503).json({ error: 'No se pudo localizar esa dirección. Intenta de nuevo o ingresa las coordenadas manualmente.' }); }
    finally { pending.delete(key); }
  });
  return router;
}

module.exports = { createLocationRouter };
