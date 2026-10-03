const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, load, D } = require('./helpers/comfort.cjs');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };

test('SQLite: deletion of an unarchived temporary message is harmless; existing archived content is marked and preserved', sqlite, async t => {
 const f = await fixture(t), item = await f.create(), logged = [], errors = [];
 await f.db.guild.update({ where: { id: f.guildId }, data: { archive: true } });
 f.client.log = { warn: (...args) => errors.push(args), error: (...args) => errors.push(args) };
 const Listener = load('src/listeners/client/messageDelete.js', {
  '@eartharoid/dbf': { Listener: class { constructor(client) { this.client = client; } } },
  '../../lib/threads': { pools: { crypto: { queue: async callback => callback({ decrypt: value => value }) } } },
  '../../lib/logging': { logMessageEvent: async (_client, event) => logged.push(event) },
 });
 const listener = new Listener(f.client);
 const message = { id: item.ticket.id + '1', channel: item.channel, guild: { fetchAuditLogs: async () => ({ entries: new D.Collection() }) },
  author: { id: f.client.user.id }, cleanContent: '', flags: { has: () => false } };
 await listener.run(message); assert.equal(errors.length, 0); assert.equal(await f.db.archivedMessage.count({ where: { id: message.id } }), 0);
 await f.db.archivedUser.create({ data: { ticketId: item.ticket.id, userId: f.ids.creator, username: 'Creator', displayName: 'Creator', avatar: 'avatar' } });
 await f.db.archivedMessage.create({ data: { id: message.id, ticketId: item.ticket.id, authorId: f.ids.creator, content: JSON.stringify({ content: 'Archived before deletion' }) } });
 await listener.run({ ...message, author: { id: f.ids.creator } });
 const saved = await f.db.archivedMessage.findUnique({ where: { id: message.id } });
 assert.equal(saved.deleted, true); assert.equal(JSON.parse(saved.content).content, 'Archived before deletion'); assert.equal(logged[0].diff.original.content, 'Archived before deletion'); assert.equal(errors.length, 0);
});
