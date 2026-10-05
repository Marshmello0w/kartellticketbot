const test = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { PrismaClient } = require('@prisma/client');
const { fixture, load, presentation, D } = require('./helpers/comfort.cjs');
const close = require('../src/lib/ticket-close-channel');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };

test('closed channel names use the ticket number without priority or waiting prefixes, retaining the underlying ticket fields', () => {
 const ticket = { open: false, number: 27, channelBaseName: 'custom-name', priority: 'HIGH', guild: { automaticTicketStatus: true } };
 assert.equal(presentation.channelName(ticket), 'closed-27');
 ticket.priority = 'LOW'; ticket.channelBaseName = 'new-name';
 assert.equal(presentation.channelName(ticket), 'closed-27');
 assert.equal(ticket.priority, 'LOW'); assert.equal(ticket.channelBaseName, 'new-name');
});

test('SQLite/admin API: closed category validates server/type/permissions and saves, reloads and clears with existing admin rights', sqlite, async t => {
 const f = await fixture(t), app = Fastify(); t.after(() => app.close());
 const cacheRefreshes = []; f.client.tickets.getCategory = async id => cacheRefreshes.push(id);
 const routes = load('src/routes/api/admin/guilds/[guild]/settings.js', { '../../../../../lib/logging.js': { logAdminEvent() {} } });
 app.decorate('authenticate', async (req, reply) => { if (!req.headers['x-role']) return reply.code(401).send(); req.user = { id: f.ids.admin }; });
 app.decorate('isAdmin', async (req, reply) => { if (req.headers['x-role'] !== 'admin') return reply.code(403).send(); });
 for (const method of ['get', 'patch']) app.route({ method: method.toUpperCase(), url: '/settings/:guild', config: { client: f.client }, ...routes[method](app) });
 const url = '/settings/' + f.guildId, headers = { 'x-role': 'admin' };
 const patch = payload => app.inject({ method: 'PATCH', url, headers, payload });
 const target = f.channel(f.guildId + '50', 'Closed'); target.type = D.ChannelType.GuildCategory;
 target.permissionsFor = () => new D.PermissionsBitField(['ViewChannel', 'ManageChannels']);
 assert.equal((await app.inject({ method: 'PATCH', url, payload: { closedTicketCategory: target.id } })).statusCode, 401);
 assert.equal((await app.inject({ method: 'PATCH', url, headers: { 'x-role': 'staff' }, payload: { closedTicketCategory: target.id } })).statusCode, 403);
 for (const invalid of [123, false, 'not-an-id', f.overview.id, f.guildId + '99']) assert.equal((await patch({ closedTicketCategory: invalid })).statusCode, 400);
 target.guildId = 'another-server'; assert.equal((await patch({ closedTicketCategory: target.id })).statusCode, 400); target.guildId = f.guildId;
 for (const permission of ['ViewChannel', 'ManageChannels']) {
  target.permissionsFor = () => new D.PermissionsBitField([permission]);
  assert.equal((await patch({ closedTicketCategory: target.id })).statusCode, 400);
 }
 target.permissionsFor = () => new D.PermissionsBitField(['ViewChannel', 'ManageChannels']);
 let result = await patch({ closedTicketCategory: target.id }); assert.equal(result.statusCode, 200, result.body);
 assert.equal(result.json().closedTicketCategory, target.id); assert.equal((await app.inject({ url, headers })).json().closedTicketCategory, target.id);
 assert.ok(cacheRefreshes.includes(f.de.id)); assert.ok(cacheRefreshes.includes(f.en.id));
 const restarted = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 try { assert.equal((await restarted.guild.findUnique({ where: { id: f.guildId } })).closedTicketCategory, target.id); } finally { await restarted.$disconnect(); }
 result = await patch({ closedTicketCategory: '' }); assert.equal(result.statusCode, 200); assert.equal(result.json().closedTicketCategory, null);
 assert.equal((await app.inject({ url, headers })).json().closedTicketCategory, null);
});

test('the installed Discord.js channel edit keeps child overwrites when moving and renaming with lockPermissions false', async () => {
 const id = '833333333333333333', parent = '844444444444444444';
 let request;
 const original = { id, name: 'ticket-27', parentId: '855555555555555555' };
 const manager = {
  guild: {}, resolve: () => original, cache: new D.Collection([[parent, { type: D.ChannelType.GuildCategory, permissionOverwrites: { cache: new D.Collection([[id, { id, allow: new D.PermissionsBitField('ViewChannel'), deny: new D.PermissionsBitField() }]]) } }]]),
  client: { channels: { resolveId: value => value }, rest: { patch: async (route, options) => { request = { route, ...options }; return { id }; } }, actions: { ChannelUpdate: { handle: data => ({ updated: data }) } } },
 };
 await D.GuildChannelManager.prototype.edit.call(manager, id, { name: 'closed-27', parent, lockPermissions: false });
 assert.equal(request.body.name, 'closed-27'); assert.equal(request.body.parent_id, parent); assert.equal(request.body.lock_permissions, false);
 assert.equal(request.body.permission_overwrites, undefined);
});

test('an open status rename delayed past Close repairs the closed name; failed repair survives restart in the close queue', sqlite, async t => {
 for (const failure of [false, true]) {
  const f = await fixture(t), item = await f.create({ priority: 'HIGH' });
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  item.channel.setName = async name => {
   if (name.startsWith('closed-') && failure) throw Object.assign(new Error('Rate limited'), { code: 50013 });
   entered(); await gate; item.channel.name = name; return item.channel;
  };
  await presentation.syncTicket(f.client, item.ticket.id); await started;
  await f.db.ticket.update({ where: { id: item.ticket.id }, data: { open: false, closedAt: new Date(), closeChannelPending: true } });
  await close.finishCloseChannel(f.client, item.ticket.id); assert.equal(item.channel.name, 'closed-' + item.ticket.number);
  release(); await presentation.stopPresentations(f.client);
  if (!failure) assert.equal(item.channel.name, 'closed-' + item.ticket.number);
  else {
   const pending = await f.read(item.ticket.id); assert.equal(pending.closeChannelPending, true); assert.ok(pending.channelDeleteNextAttemptAt > new Date());
   await f.db.ticket.update({ where: { id: item.ticket.id }, data: { channelDeleteNextAttemptAt: new Date(Date.now() - 1) } });
   await close.finishPendingCloseChannels({ ...f.client }); assert.equal(item.channel.name, 'closed-' + item.ticket.number); assert.equal((await f.read(item.ticket.id)).closeChannelPending, false);
  }
 }
});
