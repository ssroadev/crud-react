require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');
const { createCaregiverRouter } = require('./caregivers/router');
const { createLocationRouter } = require('./locations/router');
const { createAuthService } = require('./auth/service');
const { createAuthRouter } = require('./auth/router');
const { createPetRouter } = require('./pets/router');
const { createBookingRouter } = require('./bookings/router');

const app = express();
const PORT = process.env.PORT || 3002;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendOrigin = new URL(frontendUrl).origin;
const auth = createAuthService(supabase);

app.disable('x-powered-by');
app.use(cors({ origin: frontendOrigin, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('Origin') && req.get('Origin') !== frontendOrigin) return res.status(403).json({ error: 'Origen de la petición no permitido.' });
  if (!req.is('application/json')) return res.status(415).json({ error: 'Envía los datos en formato JSON.' });
  next();
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'pawhub-backend'
  });
});

app.use('/auth', createAuthRouter(supabase, auth, { frontendUrl }));
app.use('/caregivers', createCaregiverRouter(supabase, auth.requireAccount));
app.use('/locations', createLocationRouter());
app.use('/pets', createPetRouter(supabase, auth.requireAccount));
app.use('/bookings', createBookingRouter(supabase, auth.requireAccount));

app.get('/owners', auth.requireAccount, (req, res) => res.json([req.account.profile]));
app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no son válidos.' });
  const status = error.status || 500;
  if (status >= 500) console.error('Error de PawHub:', error.name, error.code || 'server_error');
  res.status(status).json({ error: error.status ? error.message : 'No se pudo completar la operación. Intenta de nuevo.' });
});

app.listen(PORT, '0.0.0.0', () => {console.log(`Servidor escuchando en el puerto ${PORT}`);});