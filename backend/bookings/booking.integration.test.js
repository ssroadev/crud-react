const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const profileId = '11111111-1111-4111-8111-111111111111';
const otherProfileId = '22222222-2222-4222-8222-222222222222';
const schedule = [{ day: 1, start: '08:00', end: '10:00' }, { day: 1, start: '10:00', end: '18:00' }];
const offers = [{ name: 'Paseos', rate: 18000, unit: 'hora' }, { name: 'Guardería', rate: 50000, unit: 'día' }];
const monday = new Date(Date.now() + 14 * 86400000);
while (monday.getUTCDay() !== 1) monday.setUTCDate(monday.getUTCDate() + 1);
const date = monday.toISOString().slice(0, 10);

test('solicitudes: migraciones y reglas reales de PostgreSQL', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Fixture equivalente a las relaciones del proyecto, sin ejecutar el export de contexto.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE public.users(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text UNIQUE NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE public.profiles(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, id_user bigint UNIQUE NOT NULL REFERENCES public.users(id), first_name text NOT NULL, last_name text NOT NULL, phone text, bio text, avatar_url text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE public.roles(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text UNIQUE NOT NULL, description text);
    CREATE TABLE public.user_roles(id_user bigint REFERENCES public.users(id),id_role bigint REFERENCES public.roles(id));
    CREATE TABLE public.pets(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id_owner bigint NOT NULL REFERENCES public.users(id),name text NOT NULL,size text,breed text);
    CREATE TABLE public.caregivers(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id_user bigint NOT NULL UNIQUE REFERENCES public.users(id),years_experience integer DEFAULT 0,latitude numeric NOT NULL CHECK(latitude BETWEEN -90 AND 90),longitude numeric NOT NULL CHECK(longitude BETWEEN -180 AND 180),zone text NOT NULL,bio text,active boolean NOT NULL DEFAULT true,created_at timestamp DEFAULT now());
    CREATE TABLE public.services(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,name text NOT NULL UNIQUE,description text);
    CREATE TABLE public.caregiver_services(caregiver_id bigint REFERENCES public.caregivers(id),service_id bigint REFERENCES public.services(id),hourly_rate numeric,active boolean DEFAULT true,PRIMARY KEY(caregiver_id,service_id));
    CREATE TABLE public.caregiver_availability(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,caregiver_id bigint REFERENCES public.caregivers(id),day_of_week smallint,start_time time,end_time time);
    CREATE TABLE public.bookings(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id_pet bigint NOT NULL REFERENCES public.pets(id),id_caregiver bigint NOT NULL REFERENCES public.caregivers(id),id_service bigint NOT NULL REFERENCES public.services(id),start_at timestamp NOT NULL,end_at timestamp NOT NULL,status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','completed','cancelled')),total_amount numeric NOT NULL CHECK(total_amount>=0),created_at timestamptz DEFAULT now());
    CREATE TABLE public.reviews(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,id_booking bigint UNIQUE REFERENCES public.bookings(id),rating smallint,comment text);
    INSERT INTO public.users(id,email) OVERRIDING SYSTEM VALUE VALUES (101,'owner@example.com'),(202,'caregiver@example.com'),(303,'other@example.com');
    INSERT INTO public.profiles(id,id_user,first_name,last_name) OVERRIDING SYSTEM VALUE VALUES (7,101,'Ana','Pérez'),(8,202,'Luis','Díaz'),(9,303,'Otra','Persona');
    INSERT INTO public.pets(id,id_owner,name,size) OVERRIDING SYSTEM VALUE VALUES (1,101,'Coco','mediano'),(2,303,'Milo','grande');
    INSERT INTO public.caregivers(id,id_user,latitude,longitude,zone) OVERRIDING SYSTEM VALUE VALUES (77,202,4.65,-74.06,'Chapinero');
    INSERT INTO public.services(id,name) OVERRIDING SYSTEM VALUE VALUES (90,'Paseos');
    INSERT INTO public.bookings(id_pet,id_caregiver,id_service,start_at,end_at,status,total_amount) VALUES (1,77,90,'2020-01-01 09:00','2020-01-01 10:00','completed',12000);
  `);
  for (const name of ['001_caregiver_profiles.sql', '002_caregiver_search.sql', '003_registration_auth.sql']) {
    await db.exec(readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
  }
  await db.query(`INSERT INTO public.caregiver_profiles(id,profile_id,bio,experience,zone,species,services,availability,status) VALUES ($1,8,'Cuido perros','Tres años','Chapinero','["Perros"]',$2,$3,'published'),($4,9,'Cuido perros','Dos años','Centro','["Perros"]',$2,$3,'published')`, [profileId, JSON.stringify(offers), JSON.stringify(schedule), otherProfileId]);
  const migration = readFileSync(path.join(__dirname, '../migrations/004_booking_requests.sql'), 'utf8');
  await db.exec(migration); await db.exec(migration);
  const managementMigration = readFileSync(path.join(__dirname, '../migrations/005_caregiver_management.sql'), 'utf8');
  await db.exec(managementMigration); await db.exec(managementMigration);
  const chatMigration = readFileSync(path.join(__dirname, '../migrations/006_booking_chat.sql'), 'utf8');
  await db.exec(chatMigration); await db.exec(chatMigration);
  await db.exec(`INSERT INTO public.reviews(id_booking,rating,comment) VALUES (1,4,'Opinión histórica');
    INSERT INTO public.bookings(id_pet,id_caregiver,id_service,owner_id,start_at,end_at,status,total_amount)
      VALUES (1,77,90,101,'2020-01-02 09:00','2020-01-02 10:00','requested',12000);
    INSERT INTO public.reviews(id_booking,rating,comment) SELECT max(id),1,'No corresponde a un servicio completado' FROM public.bookings;`);
  // La migración debe quitar también permisos heredados de PUBLIC.
  await db.exec('GRANT ALL ON public.reviews TO PUBLIC');
  const ratingsMigration = readFileSync(path.join(__dirname, '../migrations/008_verified_reviews.sql'), 'utf8');
  await db.exec(ratingsMigration); await db.exec(ratingsMigration);
  // Supabase Storage no forma parte de PGlite; se verifica la configuración con su contrato de tabla.
  await db.exec(`CREATE SCHEMA storage;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
  const photoMigration = readFileSync(path.join(__dirname, '../migrations/009_chat_realtime_photos.sql'), 'utf8');
  await db.exec("INSERT INTO public.booking_messages(booking_id,sender_id,client_message_id,content) VALUES (1,101,'00000000-0000-4000-8000-000000000001','Mensaje anterior a las fotos')");
  await db.exec(photoMigration); await db.exec(photoMigration);
  assert.equal((await db.query('SELECT content, image_path FROM public.booking_messages')).rows[0].content, 'Mensaje anterior a las fotos');
  assert.equal((await db.query('SELECT image_path FROM public.booking_messages')).rows[0].image_path, null);
  const publicReviews = async (profile = profileId, before = null, limit = 5) => (await db.query('SELECT public.pawhub_caregiver_reviews($1,$2,$3) AS result', [profile, before, limit])).rows[0].result;
  const publishRating = async (booking, owner = 101, rating = 5, comment = 'Excelente cuidado') => (await db.query('SELECT public.pawhub_publish_review($1,$2,$3,$4) AS result', [owner, booking, rating, comment])).rows[0].result;
  assert.equal((await publicReviews()).summary.rating, 4);
  assert.equal((await publicReviews()).summary.review_count, 1);
  assert.equal((await publicReviews()).reviews[0].created_at, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM public.reviews')).rows[0].n, 2);
  assert.equal((await db.query('SELECT owner_id,caregiver_profile_id,service_name FROM public.bookings')).rows[0].owner_id, 101);
  assert.equal((await db.query('SELECT caregiver_profile_id FROM public.bookings')).rows[0].caregiver_profile_id, profileId);

  const create = async (overrides = {}) => {
    const values = { owner: 101, profile: profileId, pet: 1, service: 'Paseos', date, start: '09:00', end: '10:30', location: 'Chapinero, Bogotá', notes: 'Dar agua después del paseo', ...overrides };
    return (await db.query('SELECT * FROM public.pawhub_request_booking($1,$2,$3,$4,$5,$6,$7,$8,$9)', Object.values(values))).rows[0];
  };
  const review = async (id, decision, actor = 202, note = '') => (await db.query('SELECT * FROM public.pawhub_review_booking($1,$2,$3,$4)', [actor, id, decision, note])).rows[0];
  const reset = async () => { await db.exec('DELETE FROM public.reviews; DELETE FROM public.booking_messages; DELETE FROM public.bookings'); await db.query('UPDATE public.caregiver_profiles SET availability=$1, services=$2,status=\'published\'', [JSON.stringify(schedule), JSON.stringify(offers)]); await db.exec('UPDATE public.caregivers SET active=true'); };
  const rejects = (action, code) => assert.rejects(action, (error) => error.code === code);

  await t.test('crea solo pendiente, conserva observaciones y calcula precio y duración desde la oferta', async () => {
    await reset(); const row = await create();
    assert.equal(row.status, 'requested'); assert.equal(row.owner_id, 101); assert.equal(row.id_caregiver, 77);
    assert.equal(Number(row.total_amount), 27000); assert.equal(row.duration_minutes, 90); assert.equal(row.rate_unit, 'hora');
    assert.equal(row.notes, 'Dar agua después del paseo'); assert.equal(row.reviewed_at, null);
  });
  await t.test('acepta horarios consecutivos y no deja solicitudes superpuestas', async () => {
    await reset(); await create();
    await rejects(() => create({ start: '10:00', end: '11:00' }), '23P01');
    const later = await create({ start: '10:30', end: '11:00' }); assert.equal(later.status, 'requested');
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.bookings')).rows[0].total, 2);
  });
  await t.test('rechaza mascotas ajenas, cuenta propia, servicio inexistente, pasado y horario fuera de cobertura', async () => {
    await reset();
    await rejects(() => create({ pet: 2 }), '42501');
    await rejects(() => create({ profile: otherProfileId, owner: 303, pet: 2 }), '22023');
    await rejects(() => create({ service: 'Servicio inexistente' }), '22023');
    await rejects(() => create({ date: '2020-01-01' }), '22023');
    await rejects(() => create({ start: '07:00', end: '09:00' }), '23P01');
    await rejects(() => create({ location: '' }), '22023');
    assert.equal((await db.query('SELECT count(*)::int AS total FROM public.bookings')).rows[0].total, 0);
  });
  await t.test('solo el cuidador correspondiente puede confirmar una solicitud pendiente', async () => {
    await reset(); const row = await create();
    await rejects(() => review(row.id, 'confirmed', 303), 'P0002');
    const confirmed = await review(row.id, 'confirmed', 202, 'Te espero a esa hora.');
    assert.equal(confirmed.status, 'confirmed'); assert.ok(confirmed.reviewed_at); assert.equal(confirmed.owner_seen_at, null);
    assert.equal(confirmed.response_note, 'Te espero a esa hora.');
    await rejects(() => review(row.id, 'rejected'), 'P0001');
  });
  await t.test('rechazar libera el horario y conserva el motivo de la respuesta', async () => {
    await reset(); const row = await create();
    const rejected = await review(row.id, 'rejected', 202, 'No podré atender este servicio.');
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.response_note, 'No podré atender este servicio.');
    assert.equal((await create()).status, 'requested');
  });
  await t.test('revalida el horario y los conflictos al aceptar, conservando pendiente si falla', async () => {
    await reset(); const row = await create();
    await db.query('UPDATE public.caregiver_profiles SET availability=$1 WHERE id=$2', [JSON.stringify([{ day: 1, start: '14:00', end: '18:00' }]), profileId]);
    await rejects(() => review(row.id, 'confirmed'), '23P01');
    assert.equal((await db.query('SELECT status FROM public.bookings WHERE id=$1', [row.id])).rows[0].status, 'requested');
    await db.query('UPDATE public.caregiver_profiles SET availability=$1 WHERE id=$2', [JSON.stringify(schedule), profileId]);
    await db.query(`INSERT INTO public.bookings(id_pet,id_caregiver,id_service,start_at,end_at,status,total_amount,owner_id) SELECT id_pet,id_caregiver,id_service,start_at,end_at,'confirmed',total_amount,owner_id FROM public.bookings WHERE id=$1`, [row.id]);
    await rejects(() => review(row.id, 'confirmed'), '23P01');
  });
  await t.test('mantiene la tarifa solicitada aunque cambie el precio y calcula unidades distintas de hora', async () => {
    await reset(); const row = await create();
    await db.query('UPDATE public.caregiver_profiles SET services=$1 WHERE id=$2', [JSON.stringify([{ name: 'Paseos', rate: 99999, unit: 'hora' }]), profileId]);
    assert.equal(Number((await review(row.id, 'confirmed')).total_amount), 27000);
    await reset(); const day = await create({ service: 'Guardería' }); assert.equal(Number(day.total_amount), 50000);
  });
  await t.test('permite perfiles nuevos sin inventar coordenadas y crea su vínculo con caregivers', async () => {
    await reset(); const row = await create({ profile: otherProfileId });
    const legacy = (await db.query('SELECT * FROM public.caregivers WHERE id=$1', [row.id_caregiver])).rows[0];
    assert.equal(legacy.id_user, 303); assert.equal(legacy.latitude, null); assert.equal(legacy.longitude, null);
  });
  await t.test('las funciones no pueden ejecutarse con una clave pública', async () => {
    await db.exec('SET ROLE anon');
    await rejects(() => create(), '42501');
    await db.exec('RESET ROLE');
  });

  const complete = async (id, actor = 202) => (await db.query('SELECT * FROM public.pawhub_complete_booking($1,$2)', [actor, id])).rows[0];
  await t.test('solo el cuidador correspondiente completa un servicio aceptado y ya terminado', async () => {
    await reset(); const row = await create();
    await rejects(() => complete(row.id), 'P0001');
    await review(row.id, 'confirmed');
    await rejects(() => complete(row.id), 'P0001');
    await db.query("UPDATE public.bookings SET start_at='2020-01-01 09:00',end_at='2020-01-01 10:30',owner_seen_at=now() WHERE id=$1", [row.id]);
    await rejects(() => complete(row.id, 303), 'P0002');
    const finished = await complete(row.id);
    assert.equal(finished.status, 'completed'); assert.ok(finished.completed_at); assert.equal(finished.owner_seen_at, null);
    assert.ok(finished.reviewed_at);
    await rejects(() => complete(row.id), 'P0001');
  });
  await t.test('rechazadas y claves públicas no pueden ejecutar la finalización', async () => {
    await reset(); const row = await create(); await review(row.id, 'rejected');
    await rejects(() => complete(row.id), 'P0001');
    await db.exec('SET ROLE anon');
    await rejects(() => complete(row.id), '42501');
    await db.exec('RESET ROLE');
  });

  const { randomUUID } = require('node:crypto');
  const send = async (id, actor, content, key = randomUUID()) => (await db.query('SELECT public.pawhub_send_message($1,$2,$3,$4) AS data', [actor, id, key, content])).rows[0].data;
  const history = async (id, actor, after = null, before = null, limit = 50) => (await db.query('SELECT public.pawhub_get_chat($1,$2,$3,$4,$5) AS data', [actor, id, after, before, limit])).rows[0].data;
  await t.test('chat fotos: persiste foto sola, valida rutas, conserva historial y protege reintentos y permisos', async () => {
    await reset(); const row = await create(); const key = randomUUID();
    const path = `${row.id}/101/${key}-${'a'.repeat(64)}.webp`;
    const sendPhoto = (photo = path, content = '', actor = 101) => db.query('SELECT public.pawhub_send_message($1,$2,$3,$4,$5) AS data', [actor, row.id, key, content, photo]).then((result) => result.rows[0].data);
    const photo = await sendPhoto();
    assert.equal(photo.image_path, path); assert.equal(photo.content, '');
    assert.deepEqual(await sendPhoto(), photo);
    assert.deepEqual((await history(row.id, 202)).messages, [photo]);
    await rejects(() => sendPhoto(path, 'Contenido cambiado'), '23505');
    await rejects(() => sendPhoto(path.replace('a'.repeat(64), 'b'.repeat(64))), '23505');
    await rejects(() => sendPhoto(path.replace('/101/', '/202/')), '22023');
    await rejects(() => sendPhoto('../archivo.webp'), '22023');
    await rejects(() => sendPhoto(path, '', 303), 'P0002');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await rejects(() => sendPhoto(), '42501');
      await rejects(() => db.query('SELECT public.pawhub_chat_context($1,$2)', [101, row.id]), '42501');
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    assert.deepEqual(await sendPhoto(), photo);
    assert.equal((await db.query('SELECT public.pawhub_chat_context($1,$2) AS data', [101, row.id])).rows[0].data.id, String(row.id));
    await db.exec('RESET ROLE');
    const bucket = (await db.query("SELECT * FROM storage.buckets WHERE id = 'booking-chat-photos'")).rows[0];
    assert.equal(bucket.public, false); assert.equal(Number(bucket.file_size_limit), 5242880);
    assert.deepEqual(bucket.allowed_mime_types, ['image/webp']);
  });
  await t.test('chat privado: ambos participantes conversan y terceros no pueden consultar ni enviar', async () => {
    await reset(); const row = await create();
    assert.deepEqual((await history(row.id, 101)).messages, []);
    const first = await send(row.id, 101, '  ¿Puedes llevar agua?\nCoco tiene mucha sed.  ');
    const second = await send(row.id, 202, 'Sí, llevaré agua.');
    assert.equal(first.content, '¿Puedes llevar agua?\nCoco tiene mucha sed.');
    assert.equal(first.sender_id, '101'); assert.equal(second.sender_id, '202');
    assert.equal(typeof first.id, 'string'); assert.ok(Date.parse(first.created_at));
    const conversation = await history(row.id, 101);
    assert.equal(conversation.booking.owner.first_name, 'Ana');
    assert.equal(conversation.booking.caregiver.first_name, 'Luis');
    assert.equal(conversation.booking.pet.name, 'Coco');
    assert.deepEqual(conversation.messages, [first, second]);
    assert.deepEqual((await history(row.id, 202)).messages, conversation.messages);
    await rejects(() => history(row.id, 303), 'P0002');
    await rejects(() => send(row.id, 303, 'No autorizado'), 'P0002');
    await rejects(() => history(999999, 101), 'P0002');
    const other = await create({ start: '11:00', end: '12:00' });
    assert.deepEqual((await history(other.id, 101)).messages, []);
  });
  await t.test('chat: reintentar no duplica, y un mismo identificador no puede cambiar el contenido', async () => {
    await reset(); const row = await create(); const key = randomUUID();
    const first = await send(row.id, 101, 'Hola', key);
    assert.deepEqual(await send(row.id, 101, 'Hola', key), first);
    await rejects(() => send(row.id, 101, 'Texto cambiado', key), '23505');
    // La clave está asociada también al remitente: no expone mensajes de la otra parte.
    const other = await send(row.id, 202, 'Respuesta', key);
    assert.notEqual(first.id, other.id);
    assert.equal((await history(row.id, 101)).messages.length, 2);
    await review(row.id, 'rejected');
    assert.equal((await history(row.id, 101)).messages.length, 2);
    await send(row.id, 202, 'Podemos hablar para un próximo servicio.');
    assert.equal((await history(row.id, 202)).booking.status, 'rejected');
  });
  await t.test('chat: paginación ordenada, novedades y validación en PostgreSQL', async () => {
    await reset(); const row = await create(); const all = [];
    for (let i = 0; i < 7; i++) all.push(await send(row.id, i % 2 ? 202 : 101, `Mensaje ${i}`));
    const latest = await history(row.id, 101, null, null, 3);
    assert.deepEqual(latest.messages, all.slice(4)); assert.equal(latest.has_older, true);
    const older = await history(row.id, 101, null, latest.messages[0].id, 3);
    assert.deepEqual(older.messages, all.slice(1, 4)); assert.equal(older.has_older, true);
    assert.deepEqual((await history(row.id, 101, null, older.messages[0].id, 3)).messages, all.slice(0, 1));
    const updates = await history(row.id, 202, all[0].id, null, 3);
    assert.deepEqual(updates.messages, all.slice(1, 4)); assert.equal(updates.has_more, true);
    const rest = await history(row.id, 202, updates.messages.at(-1).id, null, 3);
    assert.deepEqual(rest.messages, all.slice(4)); assert.equal(rest.has_more, false);
    assert.equal((await history(row.id, 101, 0)).messages.length, 7);
    assert.deepEqual((await history(row.id, 101, all.at(-1).id)).messages, []);
    await rejects(() => history(row.id, 101, -1), '22023');
    await rejects(() => history(row.id, 101, 1, 2), '22023');
    await rejects(() => history(row.id, 101, null, null, 101), '22023');
    await rejects(() => send(row.id, 101, ' \n\t '), '22023');
    await rejects(() => send(row.id, 101, 'a'.repeat(4001)), '22023');
  });
  await t.test('chat: limita nuevos envíos y permite recuperar un envío ya guardado', async () => {
    await reset(); const row = await create(); const key = randomUUID();
    const first = await send(row.id, 101, 'Primer mensaje', key);
    for (let i = 1; i < 30; i++) await send(row.id, 101, `Mensaje ${i}`);
    await rejects(() => send(row.id, 101, 'Demasiados'), 'P0001');
    assert.deepEqual(await send(row.id, 101, 'Primer mensaje', key), first);
    assert.equal((await send(row.id, 202, 'La otra parte puede responder')).sender_id, '202');
  });
  await t.test('chat: claves públicas no pueden leer la tabla ni invocar funciones con identidad inventada', async () => {
    await reset(); const row = await create();
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await rejects(() => history(row.id, 101), '42501');
      await rejects(() => send(row.id, 101, 'Identidad falsa'), '42501');
      await rejects(() => db.query('SELECT * FROM public.booking_messages'), '42501');
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    assert.equal((await history(row.id, 101)).booking.owner.id, '101');
    assert.equal((await send(row.id, 202, 'Envío autorizado desde el backend')).sender_id, '202');
    await db.exec('RESET ROLE');
  });

  const completedService = async () => (await db.query(`INSERT INTO public.bookings(id_pet,id_caregiver,id_service,owner_id,caregiver_profile_id,service_name,start_at,end_at,status,total_amount)
    VALUES (1,77,90,101,$1,'Paseos','2020-01-01 09:00','2020-01-01 10:00','completed',18000) RETURNING id`, [profileId])).rows[0];

  await t.test('opiniones: solo el dueño publica tras completar, reintentar no duplica y no cambia una valoración previa', async () => {
    await reset(); const row = await completedService();
    await rejects(() => publishRating(row.id, 303), 'P0002');
    await rejects(() => publishRating(row.id, 202), 'P0002');
    const first = await publishRating(row.id);
    assert.equal(first.created, true); assert.equal(first.review.rating, 5); assert.ok(first.review.created_at);
    const retry = await publishRating(row.id); assert.equal(retry.created, false); assert.deepEqual(retry.review, first.review);
    await rejects(() => publishRating(row.id, 101, 4, 'Otra opinión'), '23505');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM public.reviews')).rows[0].n, 1);
  });

  await t.test('opiniones: rechaza estados no completados, servicios futuros, mascotas ajenas y autopuntuaciones', async () => {
    await reset(); const row = await completedService();
    for (const status of ['requested', 'confirmed', 'rejected', 'cancelled']) {
      await db.query('UPDATE public.bookings SET status=$1 WHERE id=$2', [status,row.id]);
      await rejects(() => publishRating(row.id), 'P0001');
    }
    await db.query("UPDATE public.bookings SET status='completed',end_at='2099-01-01 10:00' WHERE id=$1", [row.id]);
    await rejects(() => publishRating(row.id), 'P0001');
    await db.query("UPDATE public.bookings SET end_at='2020-01-01 10:00',id_pet=2 WHERE id=$1", [row.id]);
    await rejects(() => publishRating(row.id), '42501');
    await db.query('UPDATE public.bookings SET id_pet=1,owner_id=202 WHERE id=$1', [row.id]);
    await rejects(() => publishRating(row.id, 202), '42501');
  });

  await t.test('opiniones: trigger impide inserciones inválidas y cambiar autor o servicio', async () => {
    await reset(); const row = await completedService();
    for (const [author, rating] of [[null,5],[303,5],[101,0],[101,6]]) {
      await assert.rejects(() => db.query('INSERT INTO public.reviews(id_booking,author_id,rating) VALUES ($1,$2,$3)', [row.id,author,rating]));
    }
    await rejects(() => publishRating(row.id,101,5,'a'.repeat(2001)), '22023');
    await publishRating(row.id,101,4,'  Muy buen servicio  ');
    const other = await completedService();
    await rejects(() => db.query('UPDATE public.reviews SET id_booking=$1 WHERE id_booking=$2',[other.id,row.id]), '22023');
    await rejects(() => db.query('UPDATE public.reviews SET author_id=303 WHERE id_booking=$1',[row.id]), '22023');
    assert.equal((await publicReviews()).reviews[0].comment, 'Muy buen servicio');
  });

  await t.test('opiniones: promedio completo, distribución, comentarios, autor y páginas sin reservas privadas', async () => {
    await reset();
    for (const rating of [5,4,3]) { const row = await completedService(); await publishRating(row.id,101,rating,`Experiencia ${rating}`); }
    const first = await publicReviews(profileId,null,2);
    assert.equal(first.summary.rating, 4); assert.equal(first.summary.review_count, 3);
    assert.deepEqual(first.summary.distribution, {'1':0,'2':0,'3':1,'4':1,'5':1});
    assert.equal(first.reviews.length,2); assert.equal(first.has_more,true);
    assert.equal(first.reviews[0].author_name,'Ana'); assert.equal(first.reviews[0].service_name,'Paseos');
    assert.equal('id_booking' in first.reviews[0],false); assert.equal('author_id' in first.reviews[0],false);
    assert.equal(JSON.stringify(first).includes('owner@example.com'),false);
    const next = await publicReviews(profileId,first.next_cursor,2);
    assert.equal(next.reviews.length,1); assert.equal(next.has_more,false); assert.equal(next.next_cursor,null);
    assert.equal(next.summary.review_count,3);
    assert.equal(new Set([...first.reviews,...next.reviews].map((r)=>r.id)).size,3);
    assert.equal((await publicReviews(otherProfileId)).summary.review_count,0);
    assert.equal((await publicReviews(otherProfileId)).summary.rating,null);
  });

  await t.test('opiniones: perfiles no públicos, reservas desmarcadas y roles sin permiso no exponen ni publican opiniones', async () => {
    await reset(); const row = await completedService(); await publishRating(row.id);
    await db.query("UPDATE public.bookings SET status='cancelled' WHERE id=$1",[row.id]);
    assert.equal((await publicReviews()).summary.review_count,0);
    await db.query("UPDATE public.caregiver_profiles SET status='draft' WHERE id=$1",[profileId]);
    await rejects(()=>publicReviews(),'P0002');
    await db.query("UPDATE public.caregiver_profiles SET status='published' WHERE id=$1",[profileId]);
    await db.exec('UPDATE public.caregivers SET active=false WHERE id=77');
    await rejects(()=>publicReviews(),'P0002');
    await db.exec('UPDATE public.caregivers SET active=true WHERE id=77');
    const fresh = await completedService();
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      await rejects(()=>publicReviews(),'42501'); await rejects(()=>publishRating(row.id),'42501');
      await rejects(()=>db.query('SELECT * FROM public.reviews'),'42501');
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    assert.equal((await publicReviews()).summary.review_count,0);
    assert.equal((await publishRating(fresh.id)).created,true);
    await rejects(()=>db.query('INSERT INTO public.reviews(id_booking,author_id,rating) VALUES ($1,101,5)',[row.id]),'42501');
    await db.exec('RESET ROLE');
  });
});
