const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, actions, load, presentation: P, D } = require('./helpers/comfort.cjs');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };

function message(f, row, author = f.ids.staff, overrides = {}) {
 return { guildId: f.guildId, channelId: row.ticket.id, author: { id: author, bot: false }, content: 'I will help you.', attachments: new D.Collection(), ...overrides };
}

test('SQLite/Discord: a category supporter reply claims the ticket, ends AI and preserves priority and creator', sqlite, async t => {
 const f = await fixture(t), row = await f.create({ priority: 'HIGH', aiState: 'active' });
 await P.syncTicket(f.client, row.ticket.id);
 const overviewId = (await f.read(row.ticket.id)).overviewMessageId;
 assert.equal(await actions.claimOnReply(f.client, message(f, row)), true);
 const ticket = await f.read(row.ticket.id);
 assert.equal(ticket.claimedById, f.ids.staff); assert.equal(ticket.aiState, 'human');
 assert.equal(ticket.createdById, f.ids.creator); assert.equal(ticket.priority, 'HIGH'); assert.equal(ticket.channelBaseName, 'ticket-042');
 assert.ok(row.channel.permissionOverwrites.cache.get(f.ids.staff).allow.has('ViewChannel'));
 assert.ok(row.channel.permissionOverwrites.cache.get(f.roles.de).deny.has('ViewChannel'));
 await P.syncTicket(f.client, row.ticket.id);
 assert.equal((await f.read(row.ticket.id)).overviewMessageId, overviewId);
 assert.ok(f.overview.messages.cache.get(overviewId).embeds[0].data.fields.some(field => field.value.includes(f.ids.staff)));
 assert.equal(f.errors.length, 0);
});

test('SQLite/Discord: creator, unrelated roles, ordinary participants and non-human messages never claim', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 f.members.get(f.ids.creator).roles.cache.set(f.roles.de, {});
 for (const input of [
  message(f, row, f.ids.creator), message(f, row, f.ids.user), message(f, row, f.ids.outsider),
  message(f, row, f.ids.staff, { author: { id: f.ids.staff, bot: true } }),
  message(f, row, f.ids.staff, { webhookId: 'webhook' }), message(f, row, f.ids.staff, { system: true }),
  message(f, row, f.ids.staff, { content: ' ' }), message(f, row, f.ids.staff, { guildId: null }),
  message(f, row, f.ids.staff, { guildId: 'foreign' }),
 ]) assert.equal(await actions.claimOnReply(f.client, input), false);
 assert.equal((await f.read(row.ticket.id)).claimedById, null);
 const english = await f.create({ categoryId: f.en.id });
 assert.equal(await actions.claimOnReply(f.client, message(f, english)), false);
 assert.equal((await f.read(english.ticket.id)).claimedById, null);
});

test('SQLite/Discord: attachments, English category staff and administrators can claim without the claim button', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 assert.equal(row.ticket.categoryId, f.de.id); assert.equal(f.de.claiming, false);
 assert.equal(await actions.claimOnReply(f.client, message(f, row, f.ids.staff, { content: '', attachments: new D.Collection([['file', {}]]) })), true);
 f.members.get(f.ids.next).roles.cache.set(f.roles.en, {});
 const english = await f.create({ categoryId: f.en.id });
 assert.equal(await actions.claimOnReply(f.client, message(f, english, f.ids.next)), true);
 const admin = await f.create(); assert.equal(await actions.claimOnReply(f.client, message(f, admin, f.ids.admin)), true);
});

test('SQLite/Discord: closed, deleted and pending deletion tickets cannot be claimed', sqlite, async t => {
 const f = await fixture(t);
 for (const state of [{ open: false }, { deleted: true }, { channelDeletePending: true }]) {
  const row = await f.create(state);
  assert.equal(await actions.claimOnReply(f.client, message(f, row)), false);
  assert.equal((await f.read(row.ticket.id)).claimedById, null);
  assert.equal(row.channel.permissionOverwrites.cache.size, 0);
 }
});

test('SQLite/Discord: first arriving reply wins, even while its initial database read is delayed', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 let release, readStarted;
 const gate = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { readStarted = resolve; });
 let reads = 0;
 const ticketDb = new Proxy(f.db.ticket, { get(target, key) {
  if (key !== 'findUnique') return Reflect.get(target, key);
  return async args => { if (++reads === 1) { readStarted(); await gate; } return target.findUnique(args); };
 } });
 f.client.prisma = new Proxy(f.db, { get: (target, key) => key === 'ticket' ? ticketDb : Reflect.get(target, key) });
 const first = actions.claimOnReply(f.client, message(f, row)); await started;
 const second = actions.claimOnReply(f.client, message(f, row, f.ids.next));
 release(); assert.deepEqual(await Promise.all([first, second]), [true, false]);
 assert.equal((await f.read(row.ticket.id)).claimedById, f.ids.staff);
 assert.equal(await actions.claimOnReply(f.client, message(f, row, f.ids.admin)), false);
 assert.equal(await actions.claimOnReply(f.client, message(f, row)), false);
 assert.equal((await f.read(row.ticket.id)).claimedById, f.ids.staff);
});

test('SQLite/Discord: manual claim and automatic replies share the same assignment queue', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 const manual = actions.performAction(f.client, { guildId: f.guildId, ticketId: row.ticket.id, actorId: f.ids.next, action: 'claim' });
 const automatic = actions.claimOnReply(f.client, message(f, row));
 await manual; assert.equal(await automatic, false);
 assert.equal((await f.read(row.ticket.id)).claimedById, f.ids.next);
});

test('SQLite/Discord: Discord permission failure restores ownership and allows a later reply to claim', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 await row.channel.permissionOverwrites.edit(f.roles.de, { ViewChannel: true });
 row.channel.failPermissions = true;
 await assert.rejects(actions.claimOnReply(f.client, message(f, row)), /Permissions unavailable/);
 assert.equal((await f.read(row.ticket.id)).claimedById, null);
 assert.ok(row.channel.permissionOverwrites.cache.get(f.roles.de).allow.has('ViewChannel'));
 assert.equal(row.channel.permissionOverwrites.cache.has(f.ids.staff), false);
 row.channel.failPermissions = false;
 assert.equal(await actions.claimOnReply(f.client, message(f, row, f.ids.next)), true);
});

test('SQLite/Discord: state changes by another process between validation and assignment cannot grant stale access', sqlite, async t => {
 const f = await fixture(t);
 for (const state of [{ categoryId: f.en.id }, { createdById: f.ids.staff }, { open: false }, { channelDeletePending: true }]) {
  const row = await f.create(); let changed = false;
  const ticketDb = new Proxy(f.db.ticket, { get(target, key) {
   if (key !== 'updateMany') return Reflect.get(target, key);
   return async args => {
    if (!changed && args.data.claimedById === f.ids.staff) { changed = true; await target.update({ where: { id: row.ticket.id }, data: state }); }
    return target.updateMany(args);
   };
  } });
  f.client.prisma = new Proxy(f.db, { get: (target, key) => key === 'ticket' ? ticketDb : Reflect.get(target, key) });
  assert.equal(await actions.claimOnReply(f.client, message(f, row)), false);
  assert.equal(changed, true); assert.equal((await f.read(row.ticket.id)).claimedById, null);
  assert.equal(row.channel.permissionOverwrites.cache.size, 0);
 }
});

test('SQLite/Discord: message listener claims the first supporter and still archives and records the reply', sqlite, async t => {
 const f = await fixture(t), row = await f.create(); const archived = [], enqueued = [];
 let release, permissionsFinished = false;
 const gate = new Promise(resolve => { release = resolve; }), edit = row.channel.permissionOverwrites.edit;
 row.channel.permissionOverwrites.edit = async (...args) => { await gate; permissionsFinished = true; return edit(...args); };
 const expiry = setTimeout(release, 2000); t.after(() => clearTimeout(expiry));
 await f.db.guild.update({ where: { id: f.guildId }, data: { archive: true, autoTag: [] } });
 f.client.keyv = { has: async () => true }; f.client.tickets.archiver = { saveMessage: async (...args) => { archived.push(args); assert.equal(permissionsFinished, false, 'Archive before slow Discord assignment finishes'); release(); } };
 const Listener = load('src/listeners/client/messageCreate.js', {
  '../../lib/ticket-actions': actions,
  '../../lib/users': { isStaff: async () => true },
  '../../lib/ai-support': { enqueue: async (...args) => enqueued.push(args) },
 });
 const listener = Object.create(Listener.prototype); listener.client = f.client;
 const reply = row.channel.add({ content: 'I will help you.' }, { id: f.ids.staff, bot: false });
 await listener.run({ ...reply, channel: row.channel, guild: f.guild });
 const ticket = await f.read(row.ticket.id);
 assert.equal(ticket.claimedById, f.ids.staff); assert.equal(ticket.lastParticipantSide, 'STAFF');
 assert.equal(+ticket.firstResponseAt, +reply.createdAt); assert.equal(archived.length, 1); assert.equal(enqueued.length, 1);
 assert.equal(f.errors.length, 0);
});
