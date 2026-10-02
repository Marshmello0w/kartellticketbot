const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const url = process.env.TEST_DATABASE_URL;

function load(file, dependencies) {
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
  module, require: name => dependencies[name] || {}, Date, setTimeout,
 });
 return module.exports;
}
const crypto = { queue: async callback => callback({ encrypt: x => 'encrypted:' + x, decrypt: x => x.slice(10) }) };
const Manager = load('src/lib/tickets/manager.js', { '../threads': { pools: { crypto } } });
const handle = load('src/lib/stale.js', { './commands': { getCommandCache: client => client.application.commands.cache } });

test('SQLite: migration, restart, cancellation and atomic closing claim', { skip: !url }, async () => {
 let db = new PrismaClient({ datasources: { db: { url } } });
 const guildId = 'test-' + Date.now();
 const userId = guildId + '-user';
 const ticketId = guildId + '-ticket';
 try {
  await db.guild.create({ data: { id: guildId, staleAfter: null } });
  await db.user.create({ data: { id: userId } });
  await db.ticket.create({ data: { id: ticketId, guildId, createdById: userId, number: 1, openingMessageId: 'prompt' } });
  const manager = Object.create(Manager.prototype);
  manager.client = { prisma: db };
  let ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { guild: true } });
  await manager.scheduleClose(ticket, { id: 'close-prompt' }, userId, 'done');
  await db.$disconnect();
  db = new PrismaClient({ datasources: { db: { url } } });
  manager.client.prisma = db;
  ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  assert.equal(ticket.closeScheduledAt - ticket.closeRequestedAt, 43200000);
  assert.equal((await manager.getCloseDetails(ticketId)).reason, 'done');
  await db.ticket.update({ where: { id: ticketId }, data: { closeScheduledAt: new Date(Date.now() - 1000) } });
  const closed = [];
  const client = {
   prisma: db, application: { commands: { cache: { find: () => ({ name: 'close', id: 'cmd' }) } } },
   channels: { fetch: async () => ({}) }, i18n: { getLocale: () => () => '' },
   log: { info: { cron() {} }, success: { cron() {} }, error: e => { throw e; } },
   tickets: { getCloseDetails: id => manager.getCloseDetails(id), finallyClose: async (...args) => closed.push(args) },
  };
  await handle(client, 900000);
  assert.equal(closed.length, 1);
  assert.equal(closed[0][1].closedBy, userId);
  await manager.cancelClose(ticketId);
  await handle(client, 900000);
  assert.equal(closed.length, 1);

  // A message committed after the initial read must prevent the close claim.
  const deadline = new Date(Date.now() - 1000);
  await db.ticket.update({ where: { id: ticketId }, data: { closeRequestedAt: new Date(), closeScheduledAt: deadline } });
  manager.getTicket = id => db.ticket.findUnique({ where: { id }, include: { guild: true } });
  manager.client.i18n = client.i18n;
  manager.client.channels = { cache: { get: () => undefined } };
  manager.client.log = client.log;
  manager.client.prisma = { ticket: {
   findUnique: args => db.ticket.findUnique(args),
   updateMany: async args => {
    await db.ticket.update({ where: { id: ticketId }, data: { closeScheduledAt: null } });
    return db.ticket.updateMany(args);
   },
  } };
  await manager.finallyClose(ticketId, { expectedCloseAt: deadline });
  assert.equal((await db.ticket.findUnique({ where: { id: ticketId } })).open, true);
 } finally {
  await db.guild.delete({ where: { id: guildId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
 }
});
