const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, load, D } = require('./helpers/comfort.cjs');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const crypto = { queue: async callback => callback({ encrypt: value => value, decrypt: value => value }) };
async function archiverFixture(t) {
 const f = await fixture(t), captures = [];
 f.guild.roles.everyone = { id: f.guildId, name: '@everyone', hexColor: '#5865f2' };
 for (const member of f.members.values()) member.guild = f.guild;
 await f.db.guild.update({ where: { id: f.guildId }, data: { archive: true } });
 const Archiver = load('src/lib/tickets/archiver.js', {
  '../threads': { pools: { crypto } },
  '../drive-archive': { captureContent: async (_client, _ticket, _content, id) => captures.push(id), stageTicketAssets: async () => {} },
 });
 f.archiver = new Archiver(f.client); f.captures = captures;
 f.client.prisma = {
  ticket: f.db.ticket, archivedRole: f.db.archivedRole, archivedUser: f.db.archivedUser,
  archivedChannel: f.db.archivedChannel, archivedMessage: f.db.archivedMessage,
  $transaction: queries => f.db.$transaction(queries),
 };
 f.message = (item, content, options = {}) => {
  const member = f.members.get(f.ids.creator);
  const message = item.channel.add({}, member.user, new Date(), {
   guild: f.guild, member, content, components: [], embeds: [], attachments: new D.Collection(),
   mentions: { members: new D.Collection(), roles: new D.Collection(), channels: new D.Collection() },
   ...options,
  });
  return message;
 };
 return f;
}

test('SQLite: concurrent captures and edits preserve one message and unique roles/users/channels per stable ID', sqlite, async t => {
 const f = await archiverFixture(t), item = await f.create(), member = f.members.get(f.ids.creator), role = f.guild.roles.everyone;
 const original = f.message(item, 'Original'), edited = { ...original, content: 'Edited message', editedAt: new Date(),
  mentions: {
   members: new D.Collection([['first', { ...member }], ['second', { ...member }]]),
   roles: new D.Collection([['first', { ...role }], ['second', { ...role }]]),
   channels: new D.Collection([['first', { id: item.channel.id, name: 'ticket' }], ['second', { id: item.channel.id, name: 'ticket' }]]),
  },
 };
 const results = await Promise.all([f.archiver.saveMessage(item.ticket.id, original), f.archiver.saveMessage(item.ticket.id, edited), f.archiver.saveMessage(item.ticket.id, edited)]);
 assert.ok(results.every(result => result !== false)); await f.archiver.flush(item.ticket.id);
 assert.equal(await f.db.archivedMessage.count({ where: { ticketId: item.ticket.id } }), 1);
 assert.equal(await f.db.archivedRole.count({ where: { ticketId: item.ticket.id } }), 1);
 assert.equal(await f.db.archivedUser.count({ where: { ticketId: item.ticket.id } }), 1);
 assert.equal(await f.db.archivedChannel.count({ where: { ticketId: item.ticket.id } }), 1);
 const saved = await f.db.archivedMessage.findUnique({ where: { id: original.id } });
 assert.equal(saved.edited, true); assert.equal(JSON.parse(saved.content).content, 'Edited message');
 assert.equal(f.errors.length, 0); assert.equal(f.archiver.pending.size, 0); assert.equal(f.archiver.queues.size, 0);
});

test('SQLite: transaction conflict rolls back completely, retries fresh writes and registers files only after success', sqlite, async t => {
 const f = await archiverFixture(t), item = await f.create(), message = f.message(item, 'Must be retained');
 const attempts = [];
 f.client.prisma.$transaction = async queries => {
  attempts.push(queries);
  if (attempts.length === 1) {
   try {
    return await f.db.$transaction([...queries, f.db.archivedRole.create({ data: { roleId: f.guildId, ticketId: item.ticket.id, name: 'duplicate', colour: '5865f2' } })]);
   } catch (error) {
    assert.equal(error.code, 'P2002'); assert.equal(await f.db.archivedRole.count({ where: { ticketId: item.ticket.id } }), 0); assert.equal(await f.db.archivedMessage.count({ where: { ticketId: item.ticket.id } }), 0); assert.equal(f.captures.length, 0);
    throw error;
   }
  }
  if (attempts.length === 2) throw Object.assign(new Error('Transaction conflict'), { code: 'P2034' });
  return f.db.$transaction(queries);
 };
 assert.notEqual(await f.archiver.saveMessage(item.ticket.id, message), false);
 assert.equal(attempts.length, 3); assert.notEqual(attempts[0][0], attempts[1][0]); assert.notEqual(attempts[1][0], attempts[2][0]);
 assert.equal(await f.db.archivedMessage.count({ where: { ticketId: item.ticket.id } }), 1); assert.deepEqual(f.captures, [message.id]); assert.equal(f.errors.length, 0);
});

test('SQLite: bounded conflict retries keep failures visible and the queue accepts subsequent messages', sqlite, async t => {
 const f = await archiverFixture(t), item = await f.create(), failed = f.message(item, 'Retry later'), next = f.message(item, 'Next event');
 let attempts = 0;
 f.client.prisma.$transaction = async queries => {
  if (++attempts <= 3) throw Object.assign(new Error('Persistent conflict'), { code: 'P2002' });
  return f.db.$transaction(queries);
 };
 const results = await Promise.all([f.archiver.saveMessage(item.ticket.id, failed), f.archiver.saveMessage(item.ticket.id, next)]);
 assert.equal(results[0], false); assert.notEqual(results[1], false); assert.equal(attempts, 4);
 await f.archiver.flush(item.ticket.id); assert.equal(f.archiver.pending.size, 0); assert.equal(f.archiver.queues.size, 0);
 assert.equal(await f.db.archivedMessage.count({ where: { id: failed.id } }), 0); assert.equal(await f.db.archivedMessage.count({ where: { id: next.id } }), 1); assert.deepEqual(f.captures, [next.id]); assert.ok(f.errors.length > 0);
 assert.notEqual(await f.archiver.saveMessage(item.ticket.id, failed), false);
 assert.equal(await f.db.archivedMessage.count({ where: { ticketId: item.ticket.id } }), 2);
});

test('SQLite: unrelated tickets can archive independently while a busy ticket waits', sqlite, async t => {
 const f = await archiverFixture(t), first = await f.create(), second = await f.create();
 let release, started;
 const gate = new Promise(resolve => { release = resolve; }), entered = new Promise(resolve => { started = resolve; });
 let transactions = 0;
 f.client.prisma.$transaction = async queries => {
  if (++transactions === 1) { started(); await gate; }
  return f.db.$transaction(queries);
 };
 const pending = f.archiver.saveMessage(first.ticket.id, f.message(first, 'First ticket'));
 await entered;
 const independent = await f.archiver.saveMessage(second.ticket.id, f.message(second, 'Second ticket'));
 assert.notEqual(independent, false); assert.equal(await f.db.archivedMessage.count({ where: { ticketId: first.ticket.id } }), 0);
 release(); assert.notEqual(await pending, false);
 assert.equal(transactions, 2); assert.equal(f.errors.length, 0);
});
