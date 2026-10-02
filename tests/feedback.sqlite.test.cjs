const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const Fastify = require('fastify');
const Cryptr = require('cryptr');

test('feedback admin API: exact IDs, permissions, pagination, isolation and unreadable comments', { skip: !process.env.TEST_DATABASE_URL }, async () => {
 const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 const guildId = String(BigInt(Date.now()) * 100000n + 4315n), otherId = guildId + '1', userId = guildId + '2';
 const crypt = new Cryptr('feedback-test-key'), errors = [];
 const file = path.join(__dirname, '../src/routes/api/admin/guilds/[guild]/feedback.js');
 const module = { exports: {} }, requireFile = createRequire(file);
 vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, require: name => name.endsWith('/threads') ? {
  pools: { crypto: { queue: async callback => callback({ decrypt: value => crypt.decrypt(value) }) } },
 } : requireFile(name) });
 const client = { prisma: db, log: { error: error => errors.push(error) }, guilds: { cache: { get: id => ({
  name: id === guildId ? 'Support' : 'Other server', members: { cache: new Map([[userId, { displayName: 'Test user' }]]) },
 }) } } };
 const app = Fastify();
 app.decorate('authenticate', async (req, reply) => { if (!req.headers['x-test-role']) return reply.code(401).send({ message: 'Unauthenticated' }); });
 app.decorate('isAdmin', async (req, reply) => { if (req.headers['x-test-role'] !== 'admin') return reply.code(403).send({ message: 'Forbidden' }); });
 app.route({ method: 'GET', url: '/api/admin/guilds/:guild/feedback', config: { client }, ...module.exports.get(app) });
 const url = `/api/admin/guilds/${guildId}/feedback`, headers = { 'x-test-role': 'admin' };
 try {
  await db.guild.createMany({ data: [{ id: guildId }, { id: otherId }] });
  await db.user.create({ data: { id: userId } });
  assert.equal((await app.inject({ url })).statusCode, 401);
  assert.equal((await app.inject({ url, headers: { 'x-test-role': 'member' } })).statusCode, 403);
  assert.deepEqual((await app.inject({ url, headers })).json().entries, []);
  for (let number = 1; number <= 26; number++) {
   const createdAt = new Date(1700000000000 + number * 1000), id = guildId + '-' + number;
   await db.ticket.create({ data: { id, guildId, createdById: userId, number, openingMessageId: 'opening', open: false } });
   await db.feedback.create({ data: { ticketId: id, guildId, userId: number === 24 ? null : userId, rating: 5,
    createdAt, comment: number === 26 ? crypt.encrypt('Danke!\nSecond line <script>alert(1)</script>') : number === 25 ? 'corrupt ciphertext' : null,
   } });
  }
  const result = await app.inject({ url, headers });
  assert.equal(result.statusCode, 200, result.body);
  const body = result.json();
  assert.equal(body.guild.id, guildId); assert.equal(body.total, 26); assert.equal(body.entries.length, 25);
  assert.equal(body.entries[0].number, 26); assert.equal(body.entries[0].userName, 'Test user');
  assert.equal(body.entries[0].comment, 'Danke!\nSecond line <script>alert(1)</script>');
  assert.equal(body.entries[1].comment, null); assert.equal(body.entries[1].commentUnavailable, true);
  assert.equal(body.entries[2].userName, 'Unbekannter Nutzer'); assert.equal(body.entries[2].commentUnavailable, false);
  assert.equal(errors.length, 1);
  const secondPage = (await app.inject({ url: url + '?page=2', headers })).json();
  assert.equal(secondPage.entries.length, 1); assert.equal(secondPage.entries[0].number, 1);
  assert.equal((await app.inject({ url: `/api/admin/guilds/${otherId}/feedback`, headers })).json().total, 0);
  for (const page of ['0', '-1', '1.5', 'NaN', '100001']) assert.equal((await app.inject({ url: url + '?page=' + page, headers })).statusCode, 400);
 } finally {
  await app.close(); await db.guild.deleteMany({ where: { id: { in: [guildId, otherId] } } });
  await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
 }
});
