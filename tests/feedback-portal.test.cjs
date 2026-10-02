const test = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test('built feedback page loads directly, preserves IDs and handles API errors and admin elevation', async () => {
 const guildId = '1549159747897524315', queries = [];
 const app = Fastify();
 let response = { guild: { id: guildId, name: 'Support' }, entries: [], total: 0, page: 1, pageSize: 25 }, status = 200;
 let handler;
 app.get('/api/users/@me', async () => ({ id: '123456789012345678', username: 'Admin', locale: 'de', avatar: null }));
 app.get('/api/client', async () => ({ username: 'Bot', version: '4.0.52', stats: {} }));
 app.get('/api/admin/guilds/:guild', async (req, reply) => { throw new Error('Statistics must not be needed for feedback'); });
 app.get('/api/admin/guilds/:guild/feedback', async (req, reply) => {
  queries.push({ guild: req.params.guild, page: req.query.page }); return reply.code(status).send(response);
 });
 app.all('/*', (req, reply) => { reply.hijack(); handler(req.raw, reply.raw, () => reply.raw.end()); });
 await app.listen({ host: '127.0.0.1', port: 0 });
 const origin = `http://127.0.0.1:${app.server.address().port}`, oldOrigin = process.env.ORIGIN;
 process.env.ORIGIN = origin;
 try {
  ({ handler } = await import(pathToFileURL(path.join(__dirname, '../portal/build/handler.js'))));
  let result = await fetch(`${origin}/settings/${guildId}/feedback`, { redirect: 'manual' });
  assert.equal(result.status, 200); assert.match(await result.text(), /1549159747897524315/);
  assert.deepEqual(queries[0], { guild: guildId, page: '1' });
  result = await fetch(`${origin}/settings/${guildId}/feedback?page=2`, { redirect: 'manual' });
  assert.equal(result.status, 200); assert.equal(queries.at(-1).page, '2');
  status = 403; response = { message: 'Forbidden', details: null };
  result = await fetch(`${origin}/settings/${guildId}/feedback`, { redirect: 'manual' });
  assert.equal(result.status, 403); assert.match(await result.text(), /Forbidden/);
  status = 401; response = { message: 'Requires admin', elevate: 'admin' };
  result = await fetch(`${origin}/settings/${guildId}/feedback`, { redirect: 'manual' });
  assert.equal(result.status, 307);
  assert.equal(result.headers.get('location'), `/auth/login?r=%2Fsettings%2F${guildId}%2Ffeedback&role=admin`);
 } finally {
  await app.close(); if (oldOrigin === undefined) delete process.env.ORIGIN; else process.env.ORIGIN = oldOrigin;
 }
});
