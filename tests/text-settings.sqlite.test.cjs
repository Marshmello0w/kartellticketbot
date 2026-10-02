const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const Fastify = require('fastify');
const I18n = require('@eartharoid/i18n');
const YAML = require('yaml');
const routes = require('../src/lib/text-settings');
const middleware = require('../src/lib/middleware/prisma-sqlite');
const { getSupportMessages } = require('../src/lib/support-texts');

test('SQLite/admin API: edit, reload, reset, permissions and category isolation', { skip: !process.env.TEST_DATABASE_URL }, async () => {
 const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); db.$use(middleware);
 const guildId = 'editor-' + Date.now(); const otherId = guildId + '-other';
 const i18n = new I18n('en-GB', { 'en-GB': YAML.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/en-GB.yml'), 'utf8')) });
 const client = { prisma: db, i18n, tickets: { getCategory: async () => {} }, guilds: { cache: { get: () => ({ members: { fetch: async () => ({ user: { tag: 'admin' } }) } }) } }, log: { info: { settings() {} } } };
 const app = Fastify();
 app.decorate('authenticate', async (req, reply) => { if (!req.headers['x-test-role']) return reply.code(401).send({ message: 'Unauthenticated' }); req.user = { id: 'admin' }; });
 app.decorate('isAdmin', async (req, reply) => { if (req.headers['x-test-role'] !== 'admin') return reply.code(403).send({ message: 'Forbidden' }); });
 for (const category of [false, true]) {
  const definitions = routes(app, category);
  const url = '/api/admin/guilds/:guild' + (category ? '/categories/:category' : '') + '/texts';
  for (const method of ['get', 'patch']) app.route({ method: method.toUpperCase(), url, config: { client }, ...definitions[method]() });
 }
 try {
  await db.guild.createMany({ data: [{ id: guildId }, { id: otherId }] });
  const base = { guildId, channelName: 'ticket-{number}', description: 'Support', discordCategory: 'category', emoji: '🎫', openingMessage: 'Hi', staffRoles: [] };
  const de = await db.category.create({ data: { ...base, name: 'Deutsch' } });
  const en = await db.category.create({ data: { ...base, name: 'English' } });
  const url = `/api/admin/guilds/${guildId}/categories/${en.id}/texts`;
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: { 'x-test-role': 'member' } })).statusCode, 403);
  const headers = { 'x-test-role': 'admin' };
  let result = await app.inject({ method: 'PATCH', url, headers, payload: { overrides: { 'buttons.close.text': 'Close ticket' } } });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal((await app.inject({ url, headers })).json().overrides['buttons.close.text'], 'Close ticket');
  assert.equal((await getSupportMessages(client, { guildId, categoryId: en.id }))('buttons.close.text'), 'Close ticket');

  const afterRestart = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); afterRestart.$use(middleware);
  try { assert.equal((await getSupportMessages({ prisma: afterRestart, i18n }, { guildId, categoryId: en.id }))('buttons.close.text'), 'Close ticket'); }
  finally { await afterRestart.$disconnect(); }
  assert.equal((await getSupportMessages(client, { guildId, categoryId: de.id }))('buttons.close.text'), 'Close');
  result = await app.inject({ method: 'PATCH', url: `/api/admin/guilds/${guildId}/texts`, headers, payload: { overrides: { 'buttons.close.text': 'Erledigt' } } });
  assert.equal(result.statusCode, 200, result.body);
  await app.inject({ method: 'PATCH', url, headers, payload: { overrides: {} } });
  assert.equal((await getSupportMessages(client, { guildId, categoryId: en.id }))('buttons.close.text'), 'Erledigt');
  assert.equal((await app.inject({ url: `/api/admin/guilds/${otherId}/categories/${en.id}/texts`, headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'PATCH', url, headers, payload: { overrides: { 'buttons.close.text': 'x'.repeat(81) } } })).statusCode, 400);
 } finally { await app.close(); await db.guild.deleteMany({ where: { id: { in: [guildId, otherId] } } }); await db.$disconnect(); }
});
