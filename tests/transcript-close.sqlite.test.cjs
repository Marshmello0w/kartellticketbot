const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const discord = require('discord.js');
const I18n = require('@eartharoid/i18n');
const YAML = require('yaml');

function load(file, replacements) {
 const absolute = path.join(__dirname, '..', file), requireFile = createRequire(absolute), module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), { module, Date, Buffer, process,
  setTimeout: callback => setTimeout(callback, 0),
  require: name => replacements[name] || requireFile(name),
 });
 return module.exports;
}

test('SQLite: confirmed and automatic close enqueue delivery; failed send survives restart', { skip: !process.env.TEST_DATABASE_URL }, async () => {
 let db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 const middleware = require('../src/lib/middleware/prisma-sqlite'); db.$use(middleware);
 const guildId = String(BigInt(Date.now()) * 100000n + 12345n), userId = guildId + '1';
 const pools = { crypto: { queue: async callback => callback({ encrypt: value => value, decrypt: value => value }) }, transcript: { queue: async callback => callback(value => value) } };
 const transcripts = load('src/lib/transcripts.js', { './threads': { pools }, fs: { readFileSync: () => 'Transcript {{ticket.number}}' } });
 const logs = [], sent = [], replies = [], errors = [];
 const Manager = load('src/lib/tickets/manager.js', { '../threads': { pools }, '../stats': {}, './archiver': class {}, '../logging': { logTicketEvent: async (_, event) => logs.push(event) }, '../transcripts': transcripts });
 const i18n = new I18n('en-GB', Object.fromEntries(['en-GB', 'de'].map(locale => [locale, YAML.parse(fs.readFileSync(path.join(__dirname, `../src/i18n/${locale}.yml`), 'utf8'))])));
 let fail = false;
 const transcriptChannel = { id: '523456789012345678', guildId, type: 0, guild: { members: { me: {} } }, permissionsFor: () => ({ has: () => true }),
  messages: { fetch: async () => new discord.Collection() },
  send: async payload => { if (fail) throw new Error('Discord unavailable'); sent.push(payload); return { id: '623456789012345678' + sent.length }; },
 };
 const guild = { name: 'Support', iconURL: () => null, members: { cache: new discord.Collection(), fetch: async () => ({}) } };
 const client = { prisma: db, i18n, user: { id: 'bot' }, config: { templates: { transcript: 'transcript.md' } }, guilds: { cache: new discord.Collection([[guildId, guild]]) },
  channels: { cache: new discord.Collection(), fetch: async id => {
   if(id===transcriptChannel.id) return transcriptChannel;
   return {id,guild,deletable:true,permissionOverwrites:{cache:new discord.Collection(),edit:async()=>{}},messages:{fetchPins:async()=>({items:[],hasMore:false})},delete:async()=>{}};
  } }, log: { warn() {}, error: error => errors.push(error) },
 };
 const manager = Object.create(Manager.prototype); manager.client = client; manager.$count = { categories: {} }; manager.archiver = { prepareClose:async()=>true,flush: async () => {} };
 manager.getTicket = id => client.prisma.ticket.findUnique({ where: { id }, include: { guild: true, category: true, feedback: true } });
 client.tickets = manager;
 try {
  await db.guild.create({ data: { id: guildId, locale: 'de', archive: true, transcriptChannel: transcriptChannel.id } });
  await db.user.create({ data: { id: userId } });
  const category = await db.category.create({ data: { guildId, name: 'English', channelName: 'ticket-{number}', description: 'Support', discordCategory: 'category', emoji: '🎫', openingMessage: 'Hi', staffRoles: [], textOverrides: { 'ticket.close.closed.title': 'Ticket closed', 'modals.feedback.title': 'Your feedback' } } });
  manager.$count.categories[category.id] = { total: 5, [userId]: 5 };
  async function create(number) {
   return db.ticket.create({ data: { id: guildId + number, guildId, categoryId: category.id, createdById: userId, number, openingMessageId: 'opening' } });
  }
  const confirmed = await create(2);
  await manager.scheduleClose(await manager.getTicket(confirmed.id), { id: 'request' }, userId, 'Resolved');
  await manager.acceptClose({ channel: { id: confirmed.id }, guild, editReply: async payload => replies.push(payload) });
  assert.equal(replies[0].embeds[0].toJSON().title, 'Ticket closed');
  assert.equal((await manager.buildFeedbackModal(await manager.getTicket(confirmed.id), { next: 'acceptClose' })).toJSON().title, 'Your feedback');
  assert.equal(sent.length, 1); assert.equal(sent[0].files.length, 1);
  assert.equal(logs[0].payload.components, undefined); assert.equal(logs[0].payload.files, undefined);
  assert.equal((await db.ticket.findUnique({ where: { id: confirmed.id } })).transcriptPending, false);

  const automatic = await create(3), deadline = new Date(Date.now() - 1000);
  await db.ticket.update({ where: { id: automatic.id }, data: { closeScheduledAt: deadline } });
  fail = true;
  await manager.finallyClose(automatic.id, { expectedCloseAt: deadline });
  let pending = await db.ticket.findUnique({ where: { id: automatic.id } });
  assert.equal(pending.open, false); assert.equal(pending.transcriptPending, true); assert.equal(pending.transcriptAttempts, 1);
  await db.$disconnect(); db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); db.$use(middleware); client.prisma = db;
  pending = await db.ticket.findUnique({ where: { id: automatic.id } });
  assert.ok(pending.transcriptNextAttemptAt > new Date());
  await db.ticket.update({ where: { id: automatic.id }, data: { transcriptNextAttemptAt: new Date(Date.now() - 1000) } });
  fail = false; await transcripts.deliverPendingTranscripts(client);
  assert.equal(sent.length, 2); assert.equal((await db.ticket.findUnique({ where: { id: automatic.id } })).transcriptPending, false);
  await transcripts.deliverPendingTranscripts(client); assert.equal(sent.length, 2);

  await db.guild.update({ where: { id: guildId }, data: { transcriptChannel: null } });
  const withoutChannel = await create(4); await manager.finallyClose(withoutChannel.id, { closedBy: userId });
  assert.equal((await db.ticket.findUnique({ where: { id: withoutChannel.id } })).transcriptPending, false);
  await db.guild.update({ where: { id: guildId }, data: { transcriptChannel: transcriptChannel.id, archive: false } });
  const withoutArchive = await create(5); await manager.finallyClose(withoutArchive.id, { closedBy: userId });
  assert.equal((await db.ticket.findUnique({ where: { id: withoutArchive.id } })).transcriptPending, false);
  assert.equal(sent.length, 2); assert.equal(logs.length, 4);
 } finally { await db.guild.delete({ where: { id: guildId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); }
});
