const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const discord = require('discord.js');
const I18n = require('@eartharoid/i18n');
const YAML = require('yaml');
const support = require('../src/lib/support-texts');
const i18n = new I18n('en-GB', { 'en-GB': YAML.parse(fs.readFileSync(path.join(__dirname, '../src/i18n/en-GB.yml'), 'utf8')) });
function fixture(options = {}) {
 const ticket = { id: '123456789012345678', guildId: '223456789012345678', createdById: '323456789012345678', closedById: null, closedReason: null, number: 7, open: false, transcriptPending: true, transcriptMessageId: null, transcriptAttempts: 0, transcriptNextAttemptAt: null, createdAt: new Date(), closedAt: new Date(), pinnedMessageIds: [], category: { name: 'English', channelName: 'ticket-{number}', textOverrides: { 'ticket.transcript.title': 'Archive #{number}' } }, guild: { locale: 'en-GB', primaryColour: '#009999', archive: true, logChannel: '423456789012345678', transcriptChannel: '523456789012345678', textOverrides: {} } };
 const sent = [], errors = [];
 const channel = { id: ticket.guild.transcriptChannel, guildId: ticket.guildId, type: discord.ChannelType.GuildText,
  guild: { members: { me: {} } }, permissionsFor: () => ({ has: flag => !options.missing || flag !== discord.PermissionsBitField.Flags[options.missing] }),
  messages: { fetch: async () => new discord.Collection((options.existing ? [options.existing] : sent).map(message => [message.id, message])) },
  send: async payload => {
   if (options.fail) throw new Error('send failed');
   const message = { id: '623456789012345678', payload, author: { id: 'bot' }, attachments: new discord.Collection([['file', {}]]), embeds: payload.embeds.map(embed => embed.toJSON()) };
   sent.push(message); return message;
  },
 };
 const client = { i18n, user: { id: 'bot' }, config: { templates: { transcript: 'transcript.md' } },
  guilds: { cache: new discord.Collection([[ticket.guildId, { name: 'Guild' }]]) }, channels: { fetch: async () => options.deleted ? null : channel },
  log: { warn() {}, error: error => errors.push(error) },
  prisma: { ticket: {
   findUnique: async () => ticket,
   findMany: async () => ticket.transcriptPending && !ticket.transcriptMessageId ? [{ id: ticket.id }] : [],
   update: async ({ data }) => Object.assign(ticket, data),
   updateMany: async ({ where, data }) => {
    if (!ticket.transcriptPending || ticket.transcriptMessageId || ticket.open || ticket.transcriptNextAttemptAt && ticket.transcriptNextAttemptAt > new Date()) return { count: 0 };
    Object.assign(ticket, data); return { count: 1 };
   },
  } },
 };
 const module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/lib/transcripts.js'), 'utf8'), {
  module, Date, Buffer, process,
  require: name => name === './transcript-html' ? require('../src/lib/transcript-html') : name === './support-texts' ? support : name === './threads' ? { pools: { transcript: { queue: async callback => callback(value => value) }, crypto: { queue: async callback => callback({ decrypt: text => text }) } } } : name === 'fs' ? { readFileSync: () => 'Transcript {{ticket.number}}: {{guildName}}' } : require(name),
 });
 return { ...module.exports, ticket, channel, client, sent, errors };
}
test('automatic transcript sends file and metadata only to transcript channel', async () => {
 const f = fixture(); await f.deliverTranscript(f.client, f.ticket.id);
 assert.equal(f.sent.length, 1); assert.equal(f.sent[0].payload.files[0].name, 'ticket-7.html');
 assert.match(f.sent[0].payload.files[0].attachment.toString(), /<!doctype html>/);
 assert.equal(f.sent[0].embeds[0].title, 'Archive #7');
 assert.equal(f.ticket.transcriptPending, false); assert.equal(f.ticket.transcriptMessageId, f.sent[0].id);
 assert.ok(f.sent[0].payload.allowedMentions.parse.length === 0);
 await f.deliverPendingTranscripts(f.client); assert.equal(f.sent.length, 1);
});
test('missing channel and disabled archiving never fall back to log channel', async () => {
 for (const setting of ['missing', 'archive']) {
  const f = fixture(); if (setting === 'missing') f.ticket.guild.transcriptChannel = null; else f.ticket.guild.archive = false;
  await f.deliverTranscript(f.client, f.ticket.id);
  assert.equal(f.sent.length, 0); assert.equal(f.ticket.open, false); assert.equal(f.ticket.transcriptPending, true); assert.equal(f.ticket.transcriptAttempts, 1);
 }
});
test('channel validation rejects wrong guild, log channel and missing file permission', async () => {
 const f = fixture({ missing: 'AttachFiles' });
 await assert.rejects(f.validateTranscriptChannel(f.client, f.ticket.guildId, f.channel.id, f.ticket.guild.logChannel), /AttachFiles/);
 await assert.rejects(f.validateTranscriptChannel(f.client, 'other', f.channel.id, null), /dieses Servers/);
 await assert.rejects(f.validateTranscriptChannel(f.client, f.ticket.guildId, f.channel.id, f.channel.id), /verschieden/);
 for (const missing of ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks']) {
  const denied = fixture({ missing });
  await assert.rejects(denied.validateTranscriptChannel(denied.client, denied.ticket.guildId, denied.channel.id, null), new RegExp(missing));
 }
});

test('deleted transcript channel leaves a durable retry without affecting closure', async () => {
 const f = fixture({ deleted: true }); await f.deliverTranscript(f.client, f.ticket.id);
 assert.equal(f.sent.length, 0); assert.equal(f.ticket.open, false); assert.equal(f.ticket.transcriptPending, true);
});
test('failed sends persist retries at 1, 5 and 15 minutes without reopening ticket', async () => {
 const f = fixture({ fail: true });
 for (const minutes of [1, 5, 15, 15]) {
  f.ticket.transcriptNextAttemptAt = null; const before = Date.now();
  await f.deliverTranscript(f.client, f.ticket.id);
  assert.ok(Math.abs(f.ticket.transcriptNextAttemptAt.getTime() - before - minutes * 60000) < 2000);
  assert.equal(f.ticket.open, false); assert.equal(f.ticket.transcriptPending, true);
 }
 assert.equal(f.ticket.transcriptAttempts, 4);
});
test('restart recovery uses existing transcript attachment instead of sending twice', async () => {
 const existing = { id: 'existing', author: { id: 'bot' }, attachments: new discord.Collection([['file', {}]]), embeds: [{ footer: { text: '123456789012345678' } }] };
 const f = fixture({ existing }); await f.deliverPendingTranscripts(f.client);
 assert.equal(f.sent.length, 0); assert.equal(f.ticket.transcriptMessageId, existing.id); assert.equal(f.ticket.transcriptPending, false);
});
test('legacy closed tickets and future retry deadlines are not delivered', async () => {
 const f = fixture(); f.ticket.transcriptPending = false; await f.deliverTranscript(f.client, f.ticket.id);
 f.ticket.transcriptPending = true; f.ticket.transcriptNextAttemptAt = new Date(Date.now() + 60000); await f.deliverTranscript(f.client, f.ticket.id);
 assert.equal(f.sent.length, 0);
});
