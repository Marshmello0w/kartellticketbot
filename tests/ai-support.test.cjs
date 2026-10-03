const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const Fastify = require('fastify');
const G = require('../src/lib/gemini-support');
const { fixture, load, presentation: P, i18n, D } = require('./helpers/comfort.cjs');
const { getCatalog, validateOverrides, getSupportMessages } = require('../src/lib/support-texts');
const crypto = { queue: async callback => callback({ encrypt: text => 'encrypted:' + text, decrypt: text => text.slice(10) }) };
const Language = load('src/lib/ai-language.js', { './threads': { pools: { crypto } } });
const A = load('src/lib/ai-support.js', { './threads': { pools: { crypto } }, './ai-language': Language });
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const now = new Date('2026-10-03T12:00:00Z');
const cfg = { freeKey: 'free-key'.repeat(5), paidKey: 'paid-key'.repeat(5), monthlyMicros: 9500000, renewalDay: 1 };
const good = text => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ action: 'answer', text, language: 'de' }) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 } });
const response = (status, body) => ({ ok: status === 200, status, headers: new Headers(), json: async () => body });
const quota = { error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
async function database(t) {
 const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 await db.aiCharge.deleteMany(); await db.aiBudget.deleteMany(); await db.aiProvider.deleteMany();
 t.after(async () => { await db.aiCharge.deleteMany(); await db.aiBudget.deleteMany(); await db.aiProvider.deleteMany(); await db.$disconnect(); });
 return db;
}
async function aiFixture(t) {
 const f = await fixture(t); f.client.log.info = () => {};
 await f.db.guild.update({ where: { id: f.guildId }, data: { aiSupportEnabled: true, aiKnowledge: 'Server FAQ' } });
 await f.db.category.update({ where: { id: f.de.id }, data: { aiKnowledge: 'Deutsche FAQ' } });
 await f.db.category.update({ where: { id: f.en.id }, data: { aiKnowledge: 'English FAQ', textOverrides: { 'ticket.ai.title': 'AI assistance', 'ticket.ai.handoff': 'A real person will help you.', 'buttons.ai_human.text': 'Human help' } } });
 t.after(async () => { const cleanup = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); try { await cleanup.aiTask.deleteMany({ where: { guildId: f.guildId } }); } finally { await cleanup.$disconnect(); } });
 const create = f.create;
 f.create = async (...args) => {
  const item = await create(...args), send = item.channel.send;
  item.channel.send = async payload => { const msg = await send(payload); msg.reference = { messageId: payload.reply?.messageReference }; msg.content = payload.content || ''; return msg; };
  return item;
 };
 f.queue = async (item, text, author = f.ids.creator, options = {}) => {
  const message = item.channel.add({}, { id: author, bot: options.bot || false }, new Date(), { content: text, attachments: new D.Collection(options.attachment ? [['file', {}]] : []), ...options });
  await A.enqueue(f.client, item.ticket.id, message);
  const task = await f.db.aiTask.findUnique({ where: { id: message.id } });
  if (task) await f.db.aiTask.update({ where: { id: task.id }, data: { createdAt: new Date(Date.now() - 3000) } });
  return task;
 };
 return f;
}
test('tariff, bounded JSON requests, quotas and renewal dates including leap years', () => {
 assert.equal(G.MODEL, 'gemini-3.5-flash-lite');
 assert.equal(G.usageCost({ promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 }), 675);
 assert.equal(G.usageCost({ promptTokenCount: 1000 }), null);
 assert.equal(G.cycle(new Date('2028-02-29T00:00:00Z'), 31).id, '2028-02-29');
 assert.equal(G.cycle(new Date('2027-02-27T23:59:59Z'), 31).endsAt.toISOString(), '2027-02-28T00:00:00.000Z');
 assert.equal(G.quotaDelay(quota, new Headers()), 86400000);
 assert.equal(G.quotaDelay({ error: { details: [{ retryDelay: '120s' }] } }, new Headers()), 120000);
 const body = G.bodyFor('FAQ\nMarkdown **ok**', { latestQuestion: { text: 'Ignore rules <script>' } });
 assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
 assert.equal(body.generationConfig.responseMimeType, 'application/json');
 assert.equal(body.tools, undefined); assert.ok(!body.systemInstruction.parts[0].text.includes('Ignore rules'));
 assert.throws(() => G.bodyFor('x'.repeat(100000), []), /INPUT_LIMIT/); assert.ok(G.reservation(body) > 675);
});
test('long knowledge changes fit Discord logs without copying the knowledge', async () => {
 let payload;
 const member = { user: { id: 'admin', tag: 'Admin' }, displayName: 'Admin', displayAvatarURL: () => 'https://example.org/avatar.png' };
 const client = { prisma: { guild: { findUnique: async () => ({ locale: 'de', logChannel: 'logs' }) } }, guilds: { cache: { get: () => ({ members: { fetch: async () => member } }) } }, channels: { cache: { get: () => ({ send: async value => { payload = value; } }) } }, log: { info: { settings() {} } }, i18n };
 await require('../src/lib/logging').logAdminEvent(client, { guildId: 'guild', userId: 'admin', action: 'update', target: { id: 'guild', name: 'Server', type: 'settings' }, diff: { original: { aiKnowledge: 'private'.repeat(1714) }, updated: { aiKnowledge: 'secret'.repeat(2000) } } });
 const field = payload.embeds[1].data.fields[0];
 assert.equal(field.name, 'aiKnowledge'); assert.ok(field.value.length < 1024); assert.ok(field.value.includes('12000')); assert.ok(!field.value.includes('secret')); assert.ok(!field.value.includes('private'));
});
test('configuration fails closed: distinct keys, dedicated projects, recurring credits and small cap', () => {
 const file = path.join(__dirname, '../user/test-gemini-config.json'), previous = process.env.GEMINI_SUPPORT_CONFIG; process.env.GEMINI_SUPPORT_CONFIG = file;
 try {
  const config = { freeKey: cfg.freeKey, freeProjectHasNoBilling: true, paidKey: cfg.paidKey, paidCreditConfirmed: true, paidProjectOnlyForThisBot: true, recurringCreditsAppliedAutomatically: true, monthlyUsd: 9.5, creditRenewalDay: 3 };
  fs.writeFileSync(file, JSON.stringify(config)); assert.equal(G.configuration().paidKey, cfg.paidKey);
  for (const update of [{ paidCreditConfirmed: false }, { recurringCreditsAppliedAutomatically: false }, { paidProjectOnlyForThisBot: false }, { paidKey: cfg.freeKey }, { monthlyUsd: 10 }, { monthlyUsd: -1 }]) {
   fs.writeFileSync(file, JSON.stringify({ ...config, ...update })); assert.equal(G.configuration().paidKey, null);
  }
  fs.writeFileSync(file, JSON.stringify({ ...config, freeProjectHasNoBilling: false })); assert.equal(G.configuration().error, 'FREE_CONFIG');
 } finally { fs.unlinkSync(file); if (previous === undefined) delete process.env.GEMINI_SUPPORT_CONFIG; else process.env.GEMINI_SUPPORT_CONFIG = previous; }
});
test('SQLite: free first, quota fallback, durable usage after restart and free quota recovery', sqlite, async t => {
 const db = await database(t), calls = [];
 const fetcher = async (url, options) => { calls.push(options.headers['x-goog-api-key']); assert.ok(!url.includes(cfg.freeKey)); assert.equal(options.redirect, 'error'); return response(200, good('Kostenlose Antwort')); };
 assert.equal((await G.generate(db, 'free-task', 'FAQ', [], cfg, fetcher, now)).tier, 'free'); assert.deepEqual(calls, [cfg.freeKey]); assert.equal(await db.aiCharge.count(), 0);
 let count = 0;
 const fallback = async (_url, options) => { calls.push(options.headers['x-goog-api-key']); return ++count === 1 ? response(429, quota) : response(200, good('Bezahlt')); };
 assert.equal((await G.generate(db, 'paid-task', 'FAQ', [], cfg, fallback, now)).tier, 'paid'); assert.deepEqual(calls.slice(-2), [cfg.freeKey, cfg.paidKey]);
 assert.equal((await db.aiBudget.findUnique({ where: { id: '2026-10-01' } })).spentMicros, 675);
 const restarted = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 try {
  assert.equal((await G.generate(restarted, 'restarted-task', 'FAQ', [], cfg, async (_url, options) => { assert.equal(options.headers['x-goog-api-key'], cfg.paidKey); return response(200, good('Restart')); }, now)).tier, 'paid');
  assert.equal((await G.status(restarted, cfg, now)).usedUsd, 0.00135);
 } finally { await restarted.$disconnect(); }
 assert.equal((await G.generate(db, 'next-day', 'FAQ', [], cfg, fetcher, new Date(+now + 86400001))).tier, 'free');
});

test('SQLite: dotted authorization keys load unchanged; free-only quotas hand off without billing', sqlite, async t => {
 const db = await database(t), file = path.join(__dirname, '../user/test-gemini-auth-config.json');
 const previous = process.env.GEMINI_SUPPORT_CONFIG; process.env.GEMINI_SUPPORT_CONFIG = file;
 const authKey = 'AQ.' + 'synthetic_auth_key-only_for_tests_1234567890';
 const input = { freeKey: authKey, freeProjectHasNoBilling: true, paidKey: '', paidCreditConfirmed: false, paidProjectOnlyForThisBot: false, recurringCreditsAppliedAutomatically: false, monthlyUsd: 9.5, creditRenewalDay: 1 };
 try {
  fs.writeFileSync(file, JSON.stringify(input));
  const config = G.configuration(); assert.equal(config.freeKey, authKey); assert.equal(config.paidKey, null); assert.equal(config.error, undefined);
  let calls = 0;
  const fetcher = async (url, options) => { calls++; assert.equal(options.headers['x-goog-api-key'], authKey); assert.ok(!url.includes(authKey)); return response(calls === 1 ? 200 : 429, calls === 1 ? good('Kostenlos') : quota); };
  assert.equal((await G.generate(db, 'auth-free', 'FAQ', [], config, fetcher, now)).tier, 'free');
  assert.equal((await G.generate(db, 'auth-quota', 'FAQ', [], G.configuration(), fetcher, now)).action, 'human');
  assert.equal((await G.generate(db, 'auth-blocked', 'FAQ', [], G.configuration(), fetcher, now)).reason, 'QUOTA');
  assert.equal(calls, 2); assert.equal(await db.aiCharge.count(), 0); assert.equal(await db.aiBudget.count(), 0);
  const paid = { ...input, paidKey: 'AQ.' + 'synthetic_paid_key-only_for_tests_1234567890', paidCreditConfirmed: true, paidProjectOnlyForThisBot: true, recurringCreditsAppliedAutomatically: true };
  fs.writeFileSync(file, JSON.stringify(paid)); assert.equal(G.configuration().paidKey, paid.paidKey);
  for (const freeKey of [authKey + '\n', authKey + ' ', 'AQ.unsafe\r\nInjected: header']) { fs.writeFileSync(file, JSON.stringify({ ...input, freeKey })); assert.equal(G.configuration().error, 'FREE_CONFIG'); }
  const safeText = load('src/lib/faq-learning.js', { './ai-language': Language }).safeText;
  const sanitized = safeText('Key: ' + authKey + '\nLegacy: AIza' + 'x'.repeat(35));
  assert.ok(!sanitized.includes(authKey)); assert.ok(!sanitized.includes('AIza')); assert.ok(sanitized.includes('[Zugangsdaten]'));
 } finally { fs.rmSync(file, { force: true }); if (previous === undefined) delete process.env.GEMINI_SUPPORT_CONFIG; else process.env.GEMINI_SUPPORT_CONFIG = previous; }
});
test('SQLite: budget precedes requests, concurrent reservations, idempotent settlement and renewal', sqlite, async t => {
 const db = await database(t), body = G.bodyFor('FAQ', []), amount = G.reservation(body), config = { ...cfg, monthlyMicros: G.reservation(body) };
 const charges = await Promise.all([G.reserve(db, 'one', config, body, now), G.reserve(db, 'two', config, body, now)]); assert.equal(charges.filter(Boolean).length, 1);
 const charge = charges.find(Boolean); assert.equal(await G.reserve(db, charge.id, cfg, body, now), null);
 await G.settle(db, charge, amount); await G.settle(db, charge, 0);
 assert.equal((await db.aiBudget.findUnique({ where: { id: charge.budgetId } })).spentMicros, amount);
 await db.aiProvider.create({ data: { id: require('crypto').createHash('sha256').update('free' + cfg.freeKey).digest('hex'), blockedUntil: new Date(+now + 60000) } });
 let calls = 0;
 assert.equal((await G.generate(db, 'over-budget', 'FAQ', [], config, async () => { calls++; }, now)).reason, 'BUDGET'); assert.equal(calls, 0);
 assert.equal((await G.status(db, { ...config, paidKey: 'changed' }, now)).usedUsd, amount / 1000000);
 assert.equal((await G.status(db, { ...cfg, renewalDay: 20 }, new Date('2026-10-10'))).usedUsd, amount / 1000000);
 assert.ok(await G.reserve(db, 'november', cfg, body, new Date('2026-11-01T00:00:00Z')));
});
test('SQLite: provider/auth/safety failures never spend paid tokens; uncertain paid failures retain reservation', sqlite, async t => {
 const db = await database(t), calls = [];
 for (const code of [400, 401, 403, 404, 500, 503]) {
  const result = await G.generate(db, 'error-' + code, 'FAQ', [], cfg, async (_url, options) => { calls.push(options.headers['x-goog-api-key']); return response(code, { error: { message: 'SECRET_MUST_NOT_BE_LOGGED' } }); }, now);
  assert.equal(result.action, 'human'); assert.equal(calls.at(-1), cfg.freeKey);
 }
 assert.equal(await db.aiCharge.count(), 0);
 let attempt = 0;
 assert.equal((await G.generate(db, 'timeout', 'FAQ', [], cfg, async () => { if (++attempt === 1) return response(429, quota); throw new Error('secret provider body'); }, now)).action, 'human');
 const charge = await db.aiCharge.findUnique({ where: { id: 'timeout' } }); assert.ok(charge.amountMicros > 0); assert.equal(charge.settled, false);
 const before = (await G.status(db, cfg, now)).usedUsd;
 assert.equal((await G.generate(db, 'timeout', 'FAQ', [], cfg, async () => { assert.fail('Duplicate billed request'); }, now)).action, 'human'); assert.equal((await G.status(db, cfg, now)).usedUsd, before);
 const empty = await G.generate(db, 'no-credit', 'FAQ', [], cfg, async () => response(402, {}), now);
 assert.equal(empty.action, 'human'); assert.equal(empty.reason, 'BUDGET'); assert.equal((await db.aiCharge.findUnique({ where: { id: 'no-credit' } })).amountMicros, 0);
});
test('SQLite: FAQ extraction uses the same free fallback and durable paid budget as first-line support', sqlite, async t => {
 const db = await database(t), context = { responseLanguage: 'en', creatorFirstText: 'Hello', messages: [{ id: 'staff-message', side: 'STAFF', text: 'Support is available from 18:00 to 22:00.' }] };
 const entry = { question: 'When is support available?', answer: 'Daily, from 18:00 to 22:00.', language: 'en', evidence: ['staff-message'] };
 const valid = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ entries: [entry] }) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50 } };
 const free = await G.analyzeFaq(db, 'faq-free', context, cfg, async (_url, options) => { assert.equal(options.headers['x-goog-api-key'], cfg.freeKey); assert.equal(JSON.parse(options.body).generationConfig.maxOutputTokens, 1536); return response(200, valid); }, now);
 assert.equal(free.tier, 'free'); assert.deepEqual(free.entries, [entry]); assert.equal(await db.aiCharge.count(), 0);
 let count = 0; const paid = await G.analyzeFaq(db, 'faq-paid', context, cfg, async (_url, options) => { assert.equal(options.headers['x-goog-api-key'], ++count === 1 ? cfg.freeKey : cfg.paidKey); return count === 1 ? response(429, quota) : response(200, valid); }, now);
 assert.equal(paid.tier, 'paid'); assert.equal((await G.status(db, cfg, now)).usedUsd, 0.000675); assert.equal((await db.aiCharge.findUnique({ where: { id: 'faq-paid' } })).settled, true);
 const limited = { ...cfg, monthlyMicros: 675 + G.reservation(G.faqBody(context)) - 1 };
 assert.equal((await G.analyzeFaq(db, 'faq-no-budget', context, limited, async () => assert.fail('No money remaining for extraction'), now)).reason, 'BUDGET');
 assert.equal((await G.generate(db, 'support-after-faq', 'FAQ', { responseLanguage: 'de' }, cfg, async () => response(200, good('Support answer')), now)).tier, 'paid'); assert.equal((await G.status(db, cfg, now)).usedUsd, 0.00135);
 const malformed = await G.analyzeFaq(db, 'faq-invalid', context, cfg, async () => response(200, { ...valid, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ entries: [{ ...entry, evidence: [] }] }) }] } }] }), now); assert.equal(malformed.action, 'human'); assert.equal(malformed.reason, 'MODEL');
});

test('SQLite/Discord: DE/EN FAQ, inheritance, custom texts, duplicates, human handoff and reply limit', sqlite, async t => {
 const f = await aiFixture(t), de = await f.create(), en = await f.create({ categoryId: f.en.id });
 const task = await f.queue(de, 'Wie geht das?'); await A.enqueue(f.client, de.ticket.id, de.channel.messages.cache.get(task.id)); assert.equal(await f.db.aiTask.count({ where: { id: task.id } }), 1);
 await f.queue(en, 'How does it work?'); const seen = [];
 const generator = async (_db, _id, knowledge, context) => { seen.push(knowledge); assert.ok(context.latestQuestion.text); return { action: 'answer', text: knowledge === 'English FAQ' ? 'English answer' : 'Deutsche Antwort', language: knowledge === 'English FAQ' ? 'en' : 'de', tier: 'free' }; };
 await A.tick(f.client, generator); assert.deepEqual(seen, ['Deutsche FAQ', 'English FAQ']);
 assert.equal(de.channel.messages.cache.last().embeds[0].data.title, 'KI-Erstsupport'); assert.equal(en.channel.messages.cache.last().embeds[0].data.title, 'AI assistance'); assert.equal(en.channel.messages.cache.last().components[0].components[0].data.label, 'Human help');
 assert.ok(de.channel.messages.cache.last().components[0].components[0].data.custom_id.length <= 100); assert.deepEqual(JSON.parse(JSON.stringify(de.channel.messages.cache.last().allowedMentions)), { parse: [], repliedUser: false });
 await f.db.category.update({ where: { id: f.de.id }, data: { aiKnowledge: '' } }); await f.queue(de, 'Noch eine Frage'); await A.tick(f.client, generator); assert.equal(seen.at(-1), 'Server FAQ');
 await f.queue(de, 'Dritte Frage'); await A.tick(f.client, generator); await f.queue(de, 'Vierte Frage'); await A.tick(f.client, generator); assert.equal((await f.read(de.ticket.id)).aiState, 'human'); assert.equal(seen.length, 4);
 await f.db.aiTask.updateMany({ where: { ticketId: de.ticket.id, state: 'handoff' }, data: { createdAt: new Date(Date.now() - 3000) } }); await A.tick(f.client, generator); assert.equal(de.channel.messages.cache.last().embeds[0].data.title, 'Ein Supporter übernimmt');
});
test('SQLite/Discord: staff, claims, closure, attachment-only and ignored bot/webhook/system messages', sqlite, async t => {
 const f = await aiFixture(t), item = await f.create();
 for (const flags of [{ bot: true }, { webhookId: 'webhook' }, { system: true }]) assert.equal(await f.queue(item, 'ignore', f.ids.creator, flags), null);
 const task = await f.queue(item, 'Hi'); await P.recordParticipant(f.client, item.ticket.id, f.ids.staff, new Date(), '999999999999999999', false); await A.tick(f.client, async () => assert.fail('Staff took over')); assert.equal((await f.db.aiTask.findUnique({ where: { id: task.id } })).state, 'cancelled');
 for (const changes of [{ claimedById: f.ids.staff }, { open: false }, { closeRequestedAt: new Date() }, { aiState: 'human' }]) { const other = await f.create(); await f.queue(other, 'Question'); await f.db.ticket.update({ where: { id: other.ticket.id }, data: changes }); await A.tick(f.client, async () => assert.fail('Inactive ticket')); }
 const item2 = await f.create(); await f.queue(item2, '', f.ids.creator, { attachment: true }); await A.tick(f.client, async () => assert.fail('Attachment-only')); assert.equal((await f.read(item2.ticket.id)).aiState, 'human');
});
test('SQLite/Discord: concurrent messages, staff during generation and restart without duplicate generation or delivery', sqlite, async t => {
 const f = await aiFixture(t), item = await f.create(), first = await f.queue(item, 'First'), latest = await f.queue(item, 'Latest');
 await f.db.aiTask.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() - 4000) } });
 let calls = 0;
 await Promise.all([A.tick(f.client, async () => { calls++; return { action: 'answer', text: 'Latest answer' }; }), A.tick(f.client, async () => assert.fail('Worker running'))]); assert.equal(calls, 1); assert.equal((await f.db.aiTask.findUnique({ where: { id: first.id } })).state, 'superseded');
 const raced = await f.create(); await f.queue(raced, 'Question'); await A.tick(f.client, async () => { await P.recordParticipant(f.client, raced.ticket.id, f.ids.staff, new Date(), '999999999999999998', false); return { action: 'answer', text: 'Must not send' }; }); assert.equal(raced.channel.sent, 0);
 const sent = await f.db.aiTask.findUnique({ where: { id: latest.id } }); await f.db.aiTask.update({ where: { id: latest.id }, data: { state: 'ready', discordMessageId: null, response: 'encrypted:Latest answer', leaseUntil: null } }); const before = item.channel.sent; for (let i=0;i<105;i++) item.channel.add({}, {id:f.ids.creator,bot:false},new Date(),{content:'After delivery',attachments:new D.Collection()});
 await A.tick(f.client, async () => assert.fail('Repeated generation')); assert.equal(item.channel.sent, before); assert.equal((await f.db.aiTask.findUnique({ where: { id: latest.id } })).discordMessageId, sent.discordMessageId);
 const interrupted = await f.create(), it = await f.queue(interrupted, 'Before crash'); await f.db.aiTask.update({ where: { id: it.id }, data: { state: 'processing', leaseUntil: new Date(Date.now() - 1) } }); await A.tick(f.client, async () => assert.fail('Uncertain generation must not repeat')); assert.equal((await f.read(interrupted.ticket.id)).aiState, 'human');
});
test('SQLite/admin: authorization, credential-free status, text inheritance, restart and validation', sqlite, async t => {
 const f = await aiFixture(t), app = Fastify();
 app.decorate('authenticate', async (req, reply) => { if (!req.headers['x-role']) return reply.code(401).send(); }); app.decorate('isAdmin', async (req, reply) => { if (req.headers['x-role'] !== 'admin') return reply.code(403).send(); });
 app.route({ method: 'GET', url: '/api/admin/guilds/:guild/ai', config: { client: f.client }, ...require('../src/routes/api/admin/guilds/[guild]/ai').get(app) }); t.after(() => app.close());
 const url = '/api/admin/guilds/' + f.guildId + '/ai'; assert.equal((await app.inject({ url })).statusCode, 401); assert.equal((await app.inject({ url, headers: { 'x-role': 'member' } })).statusCode, 403);
 const result = await app.inject({ url, headers: { 'x-role': 'admin' } }); assert.equal(result.statusCode, 200); assert.ok(!/freeKey|paidKey|refreshToken/.test(result.body));
 assert.throws(() => A.validateSettings({ aiSupportEnabled: 'yes' })); assert.throws(() => A.validateSettings({ aiKnowledge: 'x'.repeat(12001) })); A.validateSettings({ aiKnowledge: 'Markdown **ok**\nNewline' });
 assert.ok(getCatalog(i18n, 'de').some(field => field.key === 'buttons.ai_human.text')); assert.throws(() => validateOverrides(i18n, 'de', { 'buttons.ai_human.text': 'x'.repeat(81) }));
 await f.db.guild.update({ where: { id: f.guildId }, data: { textOverrides: { 'ticket.ai.title': 'Server KI' } } }); assert.equal((await getSupportMessages(f.client, { guildId: f.guildId, categoryId: f.de.id }))('ticket.ai.title'), 'Server KI'); assert.equal((await getSupportMessages(f.client, { guildId: f.guildId, categoryId: f.en.id }))('ticket.ai.title'), 'AI assistance');
 const restarted = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); try { assert.equal((await restarted.category.findUnique({ where: { id: f.en.id } })).aiKnowledge, 'English FAQ'); assert.equal((await restarted.guild.findUnique({ where: { id: f.guildId } })).aiSupportEnabled, true); } finally { await restarted.$disconnect(); }
});
