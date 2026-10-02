const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(file, dependencies) {
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
  module, require: name => dependencies[name] || {}, Date, setTimeout,
 });
 return module.exports;
}
const crypto = { queue: async callback => callback({ encrypt: x => 'encrypted:' + x, decrypt: x => x.slice(10) }) };
const Manager = load('src/lib/tickets/manager.js', { '../ticket-presentation': { syncTicket: async () => {}, requestSync() {}, participantSide: async () => "USER" }, '../threads': { pools: { crypto } }, '../support-texts': { getSupportMessages: async client => client.i18n?.getLocale?.() || (() => '') }, '../transcripts': { deliverTranscript: async () => {} } });
const handle = load('src/lib/stale.js', { './commands': { getCommandCache: client => client.application.commands.cache }, './support-texts': { getSupportMessages: async client => client.i18n.getLocale() } });
const fields = ['closeRequestedAt', 'closeScheduledAt', 'closeRequestedById', 'closeRequestReason', 'closeRequestMessageId'];

function fixture(ticket, current = ticket) {
 const closed = [], errors = [];
 let query;
 const client = {
  application: { commands: { cache: { find: () => ({ name: 'close', id: 'cmd' }) } } },
  i18n: { getLocale: () => () => '' },
  log: { info: { cron() {} }, success: { cron() {} }, error: x => errors.push(x) },
  channels: { fetch: async () => ({}) },
  prisma: {
   guild: { findMany: async args => { query = args; return [{ staleAfter: null, tickets: [ticket] }]; } },
   ticket: { findUnique: async () => current, count: async () => 1 },
  },
  tickets: { getCloseDetails: async () => ({ closedBy: 'staff', reason: 'done' }), finallyClose: async (...args) => closed.push(args) },
 };
 return { client, closed, errors, query: () => query };
}
const overdue = () => ({ id: 'ticket', open: true, closeRequestedAt: new Date(Date.now() - 13 * 3600000), closeScheduledAt: new Date(Date.now() - 3600000) });

test('restart: overdue persisted request closes without staleAfter or memory cache', async () => {
 const f = fixture(overdue()); await handle(f.client, 900000);
 assert.equal(f.closed.length, 1); assert.equal(f.closed[0][1].closedBy, 'staff');
 assert.ok(f.closed[0][1].expectedCloseAt); assert.equal(f.errors.length, 0);
 assert.ok(f.query().where.OR[1].tickets.some.closeRequestedAt);
});
test('future deadline does not close early', async () => {
 const f = fixture({ ...overdue(), closeRequestedAt: new Date(), closeScheduledAt: new Date(Date.now() + 43200000) });
 await handle(f.client, 900000); assert.equal(f.closed.length, 0); assert.equal(f.errors.length, 0);
});
test('cancellation between query and closing is respected', async () => {
 const f = fixture(overdue(), { open: true, closeScheduledAt: null });
 await handle(f.client, 900000); assert.equal(f.closed.length, 0);
});
test('disabled auto-close does not treat null deadline as overdue', async () => {
 const f = fixture({ ...overdue(), closeScheduledAt: null });
 await handle(f.client, 900000); assert.equal(f.closed.length, 0);
});
test('schedule saves twelve-hour deadline, encrypted reason and request metadata', async () => {
 let saved;
 const manager = Object.create(Manager.prototype);
 manager.client = { prisma: { ticket: { updateMany: async x => { saved = x; return { count: 1 }; } } } };
 await manager.scheduleClose({ id: 'ticket', lastMessageAt: null, guild: { autoClose: 43200000 } }, { id: 'prompt' }, 'staff', 'done');
 assert.equal(saved.data.closeScheduledAt - saved.data.closeRequestedAt, 43200000);
 assert.equal(saved.data.closeRequestReason, 'encrypted:done');
 assert.equal(saved.data.closeRequestMessageId, 'prompt');
 assert.equal(saved.where.open, true); assert.equal(saved.where.lastMessageAt, null);
});
test('reject clears all persisted request fields', async () => {
 let saved;
 const manager = Object.create(Manager.prototype);
 manager.client = { prisma: { ticket: { update: async x => { saved = x; } } } };
 await manager.cancelClose('ticket');
 for (const field of fields) assert.equal(saved.data[field], null);
});
test('accept after restart recovers requester and encrypted reason from database', async () => {
 const manager = Object.create(Manager.prototype);
 manager.client = { prisma: { ticket: { findUnique: async () => ({ closeRequestedById: 'staff', closeRequestReason: 'encrypted:done' }) } } };
 const details = await manager.getCloseDetails('ticket');
 assert.equal(details.closedBy, 'staff'); assert.equal(details.reason, 'done');
});

test('deleted Discord channel still allows finalising the overdue database record', async () => {
 const f = fixture(overdue());
 f.client.channels.fetch = async () => { throw Object.assign(new Error('Unknown Channel'), { code: 10003 }); };
 await handle(f.client, 900000);
 assert.equal(f.closed.length, 1); assert.equal(f.errors.length, 0);
});
