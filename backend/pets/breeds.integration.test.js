const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('razas SQL: migración repetible, catálogo real, RLS y conservación de mascotas', async (t) => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE TABLE pets(id bigint PRIMARY KEY, breed text); INSERT INTO pets VALUES (1, 'Mi raza anterior');");
  const sql = readFileSync(path.join(__dirname, '../migrations/007_pet_breeds.sql'), 'utf8');
  await db.exec(sql); await db.exec(sql);
  const breeds = (await db.query('SELECT id,species,name FROM pet_breeds')).rows;
  assert.ok(breeds.length >= 50);
  assert.ok(breeds.every((breed) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(breed.id)));
  assert.deepEqual([...new Set(breeds.map((breed) => breed.species))].sort(), ['Conejos', 'Gatos', 'Perros']);
  assert.equal((await db.query('SELECT breed FROM pets WHERE id=1')).rows[0].breed, 'Mi raza anterior');
  await db.exec("UPDATE pet_breeds SET active=false WHERE id='dog-beagle'");
  await db.exec(sql);
  assert.equal((await db.query("SELECT active FROM pet_breeds WHERE id='dog-beagle'")).rows[0].active, false);
  for (const role of ['anon', 'authenticated']) {
    const result = await db.query("SELECT has_table_privilege($1, 'pet_breeds', 'SELECT') AS allowed", [role]);
    assert.equal(result.rows[0].allowed, false);
  }
  assert.equal((await db.query("SELECT has_table_privilege('service_role', 'pet_breeds', 'SELECT') AS allowed")).rows[0].allowed, true);
});
