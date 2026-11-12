const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { createClient } = require('@supabase/supabase-js');
const { validateAccount } = require('../auth/validation');
const { createAuthService } = require('../auth/service');
const { validateCaregiver } = require('../caregivers/validation');
const caregivers = require('../seeds/caregivers');

const seedName = 'pawhub-caregivers-v1';
const password = process.env.SEED_CAREGIVER_PASSWORD || 'PawHubDemo2026!';

function checked(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Ejecuta esta carga únicamente en un entorno de pruebas.');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error('Configura SUPABASE_URL y SUPABASE_KEY de servidor en backend/.env.');

  // Valida todos los datos antes de crear la primera cuenta.
  const entries = caregivers.map(({ email, first_name, last_name, ...profile }) => {
    const account = { email, first_name, last_name, password, confirm_password: password, role: 'caregiver' };
    const accountResult = validateAccount(account);
    const profileResult = validateCaregiver({ ...profile, location_name: profile.zone, status: 'published' });
    const errors = { ...accountResult.errors, ...profileResult.errors };
    if (Object.keys(errors).length) throw new Error(`Datos inválidos para ${email}: ${JSON.stringify(errors)}`);
    return { account, profile: profileResult.data };
  });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const auth = createAuthService(db);

  checked(await db.from('caregiver_profiles').select('id,profile_id,latitude,longitude').limit(0), 'Verifica las migraciones 001 y 002');
  checked(await db.from('profiles').select('id,id_user,first_name,last_name').limit(0), 'Verifica la tabla profiles');
  const role = checked(await db.from('roles').select('id').eq('name', 'caregiver').single(), 'Verifica la migración 003');
  const existingAccounts = checked(await db.from('users').select('email,auth_user_id')
    .in('email', entries.map(({ account }) => account.email)), 'Consulta de cuentas existentes');

  const authUsers = new Map();
  for (let page = 1; ; page++) {
    const data = checked(await db.auth.admin.listUsers({ page, perPage: 100 }), 'Consulta administrativa de Auth');
    for (const user of data.users) authUsers.set(user.email?.toLowerCase(), user);
    if (data.users.length < 100) break;
  }

  // Nunca adopta una cuenta previa por coincidencia de correo.
  for (const { account } of entries) {
    const existing = authUsers.get(account.email);
    const legacy = existingAccounts.find((user) => user.email === account.email);
    if ((existing && existing.app_metadata?.seed !== seedName) ||
        (legacy && (!existing || legacy.auth_user_id !== existing.id))) {
      throw new Error(`El correo ${account.email} pertenece a una cuenta ajena a esta carga. No se modificó.`);
    }
  }

  let created = 0;
  let published = 0;
  for (const { account, profile } of entries) {
    let authUser = authUsers.get(account.email);
    if (!authUser) {
      const { password: accountPassword, email, confirm_password: _confirmation, ...metadata } = account;
      const data = checked(await db.auth.admin.createUser({
        email, password: accountPassword, email_confirm: true,
        user_metadata: metadata, app_metadata: { seed: seedName },
      }), `Creación de ${email}`);
      authUser = data.user;
      created++;
    }

    // El trigger del registro debe crear usuario, perfil y rol en la misma transacción.
    const savedAccount = await auth.accountFor(authUser.id);
    if (!savedAccount.roles.includes('caregiver') || !role.id) {
      throw new Error(`Falta el rol caregiver de ${account.email}. Verifica el trigger de la migración 003.`);
    }
    const existingProfile = checked(await db.from('caregiver_profiles').select('id')
      .eq('profile_id', savedAccount.profile.id).maybeSingle(), `Consulta del perfil de ${account.email}`);
    if (!existingProfile) {
      checked(await db.from('caregiver_profiles').insert({ ...profile, profile_id: savedAccount.profile.id }), `Publicación de ${account.email}`);
      published++;
    }
    console.log(`${account.email} — ${profile.zone} — ${existingProfile ? 'perfil conservado' : 'perfil publicado'}`);
  }
  console.log(`\nCuentas creadas: ${created}. Perfiles publicados: ${published}. Cuidadores de prueba: ${entries.length}.`);
  console.log('Las cuentas nuevas tienen el correo confirmado y pueden iniciar sesión.');
  console.log('Repetir el comando conserva perfiles y contraseñas existentes.');
}

main().catch((error) => {
  console.error(`No se pudo completar la carga: ${error.message}`);
  process.exitCode = 1;
});
