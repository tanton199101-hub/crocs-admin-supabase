const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const Store = require('../store-data.js');
const Regional = require('../regional-commerce.js');
let db;

before(async () => {
  db = new PGlite();
  // Supabase Auth stubs, local only. gen_random_uuid is built into PostgreSQL;
  // PGlite does not require the pgcrypto extension used by hosted Supabase.
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
  const directory = join(__dirname, '../supabase/migrations');
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(directory, file), 'utf8').replace(/create extension if not exists pgcrypto;/g, ''));
  }
});
after(async () => { await db?.close(); });

async function seed(settings) {
  const data = Store.seed();
  if (settings) data.settings = settings;
  await db.query(`insert into public.store_state (id, payload) values ('default', $1)
    on conflict (id) do update set payload = excluded.payload`, [JSON.stringify(data)]);
  return data;
}
const customer = { email: 'regional-test@example.com', name: 'Regional Test', phone: '', address: 'Test address', city: 'Hanoi', postcode: '10000' };
const lines = [{ productId: 'p1', size: '7', quantity: 1 }];

test('SQL and browser quote the same regional product, variant override and shipping', async () => {
  const data = await seed();
  data.settings.regions.find(region => region.id === 'vn').priceOverrides = { p1: { amount: 1250000, 'v-7': 1300000 } };
  await Regional.configure(data.settings);
  for (const region of data.settings.regions) {
    for (const [product, variant, price] of [[{ id: 'p2' }, null, 3499], [{ id: 'p1' }, null, 3499], [{ id: 'p1' }, { id: 'v-7' }, 3999], [null, null, 399], [null, null, 5000]]) {
      const { rows } = await db.query('select public.storefront_regional_quote_v1($1, $2, $3, $4, $5) as quote', [JSON.stringify(data.settings), region.id, product, variant, price]);
      assert.equal(rows[0].quote.price, Regional.priceFor(price, product, variant, region.id), `${region.id} ${product?.id} ${variant?.id} ${price}`);
      assert.equal(rows[0].quote.currency, region.currency);
    }
  }
});

test('regional demo order uses server prices, reserves stock and advances admin version', async () => {
  const data = await seed();
  const version = (await db.query(`select version from public.store_state where id = 'default'`)).rows[0].version;
  const { rows } = await db.query(`select public.create_storefront_order_regional_v1($1,$2,$3,$4,$5,$6,$7,$8,$9) as result`, [customer.email, customer.name, customer.phone, customer.address, customer.city, customer.postcode, 'standard', JSON.stringify([{ ...lines[0], price: 1 }]), 'vn']);
  const order = rows[0].result;
  assert.equal(order.currency, 'vnd');
  assert.equal(order.total, 1227870);
  const saved = (await db.query(`select version, payload from public.store_state where id = 'default'`)).rows[0];
  assert.ok(saved.version > version);
  assert.equal(saved.payload.products.find(p => p.id === 'p1').stock, data.products[0].stock - 1);
  assert.equal(saved.payload.orders[0].currency, 'vnd');
  assert.equal(saved.payload.orders[0].regionId, 'vn');
});

test('regional Stripe reservation and signed webhook preserve the order currency', async () => {
  await seed();
  const id = randomUUID();
  const params = [id, 'f'.repeat(64), 'r'.repeat(64), JSON.stringify({ ...customer, language: 'vi' }), JSON.stringify(lines), 'standard', 'test', 'vn'];
  const sql = `select * from public.stripe_checkout_reserve_v1($1,$2,$3,$4,$5,$6,$7,$8)`;
  const attempt = (await db.query(sql, params)).rows[0];
  assert.equal(attempt.currency, 'vnd');
  assert.equal(attempt.total, 1227870);
  assert.equal(attempt.language, 'vi');
  const repeat = (await db.query(sql, params)).rows[0];
  assert.equal(repeat.order_id, attempt.order_id);
  const sessionId = `cs_test_${id.replaceAll('-', '')}`;
  const eventSql = `select * from public.stripe_checkout_event_v1($1,$2,$3,$4,$5,$6,$7,$8,$9)`;
  const event = [`evt_${id}`, id, attempt.order_id, sessionId, 'paid', attempt.total, 'vnd', false, null];
  await db.query(eventSql, event);
  const order = (await db.query('select * from public.storefront_orders where id = $1', [attempt.order_id])).rows[0];
  assert.equal(order.currency, 'vnd');
  assert.equal(order.region_id, 'vn');
  assert.equal(order.total, attempt.total);
  await db.query(eventSql, event);
  assert.equal((await db.query('select count(*)::integer as count from public.storefront_orders where id = $1', [attempt.order_id])).rows[0].count, 1);
});

test('regional helper and Stripe reservation are not executable by anonymous shoppers', async () => {
  const result = await db.query(`select
    has_function_privilege('anon', 'public.storefront_regional_quote_v1(jsonb,text,jsonb,jsonb,integer)', 'execute') as quote,
    has_function_privilege('anon', 'public.stripe_checkout_reserve_v1(uuid,text,text,jsonb,jsonb,text,text,text)', 'execute') as reserve`);
  assert.equal(result.rows[0].quote, false);
  assert.equal(result.rows[0].reserve, false);
});
