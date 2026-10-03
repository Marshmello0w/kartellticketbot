const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { fixture, load, D } = require('./helpers/comfort.cjs');
const G = require('../src/lib/gemini-support');
const Input = require('../src/lib/ai-input');
const Search = require('../src/lib/faq-search');
const F = require('../src/lib/faq-learning');
const crypto = { queue: async fn => fn({ encrypt: value => 'sealed:' + value, decrypt: value => value.slice(7) }) };
const L = load('src/lib/ai-language.js', { './threads': { pools: { crypto } } });
const A = load('src/lib/ai-support.js', { './threads': { pools: { crypto } }, './ai-language': L });
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const config = { freeKey: 'synthetic-free-key'.repeat(3), paidKey: null, monthlyMicros: 0, renewalDay: 1 };

test('support API allowlist never sends history, form data, creator seed or ticket metadata', () => {
 const context = { responseLanguage: 'en', creatorFirstText: 'OLD_CREATOR_PRIVATE', conversation: [{ text: 'OLD_USER_PRIVATE' }, { text: 'OLD_AI_PRIVATE' }], messages: [{ text: 'TRANSCRIPT_PRIVATE' }], topic: 'TOPIC_PRIVATE', category: 'CATEGORY_PRIVATE', answers: [{ answer: 'FORM_PRIVATE' }], latestQuestion: { text: 'What does VIP cost?', attachments: false } };
 const body = G.bodyFor('Approved VIP facts', context);
 assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), { text: 'What does VIP cost?', attachments: false });
 for (const sentinel of ['OLD_CREATOR_PRIVATE', 'OLD_USER_PRIVATE', 'OLD_AI_PRIVATE', 'TRANSCRIPT_PRIVATE', 'TOPIC_PRIVATE', 'CATEGORY_PRIVATE', 'FORM_PRIVATE']) assert.ok(!JSON.stringify(body).includes(sentinel), sentinel);
 assert.ok(body.systemInstruction.parts[0].text.includes('language code en'));
 assert.equal(body.generationConfig.maxOutputTokens, 384);
 // Explicit FAQ learning keeps redacted staff evidence in its separate request.
 const evidence = { responseLanguage: 'en', messages: [{ side: 'STAFF', id: 'evidence', text: 'Confirmed FAQ answer' }] };
 assert.deepEqual(JSON.parse(G.faqBody(evidence).contents[0].parts[0].text), evidence);
});

test('automatic language is recognized locally; ambiguous keywords use the configured fallback', () => {
 assert.equal(Input.language('Hello, how can I join your server?'), 'en');
 assert.equal(Input.language('Hallo, wie finde ich euren Server?'), 'de');
 assert.equal(Input.language('Quelle est la durée du VIP?'), 'fr');
 assert.equal(Input.language('VIP', 'en'), 'en');
 assert.equal(Input.language('VIP', 'de'), 'de');
 assert.equal(Input.supportLanguage({ responseLanguage: 'en', creatorFirstText: 'Hallo' }), 'en');
});

test('local FAQ retrieval ranks relevant answers, honors category overrides and caps its size', () => {
 const entries = [
  { id: 'global', language: 'de', categoryId: null, question: 'Was kostet VIP?', answer: 'Server default' },
  { id: 'category', language: 'de', categoryId: 12, question: 'Was kostet VIP?', answer: 'Kategorie: 4,99 Euro' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: 'vip-' + i, language: 'de', categoryId: null, question: 'VIP option ' + i, answer: 'Queue details' })),
  { id: 'unrelated', language: 'de', categoryId: null, question: 'Was ist ein Granatwerfer?', answer: 'Granatwerfer information' },
 ];
 const picked = Search.select(entries, 'Was kostet VIP?', 12);
 assert.equal(picked[0].id, 'category'); assert.equal(picked.length, 4); assert.ok(!picked.some(e => ['global','unrelated'].includes(e.id)));
 assert.equal(Search.format(Search.select(entries, 'Unbekanntes Thema XYZZY', 12)), '');
 assert.ok(Buffer.byteLength(Search.format(picked.map(e => ({ ...e, answer: 'ä'.repeat(1800) }))), 'utf8') <= Search.MAX_BYTES);
 assert.ok(Search.select([{ question: 'Grenade launcher kick', answer: 'The weapon is restricted.', language: 'en', categoryId: null }], 'Granatwerfer', 12).length);
});

test('SQLite: FAQ input excludes wrong language, guild, category and unapproved drafts', sqlite, async t => {
 const f = await fixture(t);
 const create = (id, data) => f.db.faqEntry.create({ data: { id: f.guildId + id, guildId: f.guildId, categoryId: null, categoryName: 'Test', sourceTicketId: 'source', sourceTicketNumber: 1, jobId: 'test', status: 'approved', language: 'de', question: 'Was kostet VIP?', answer: 'VIP kostet 4,99 Euro', evidence: '[]', ...data } });
 await create('de', {}); await create('en', { language: 'en', question: 'What does VIP cost?', answer: 'ENGLISH_PRIVATE' });
 await create('draft', { status: 'draft', question: 'VIP draft', answer: 'DRAFT_PRIVATE' });
 await create('other-category', { categoryId: f.en.id, question: 'VIP other category', answer: 'CATEGORY_PRIVATE' });
 const otherGuild = f.guildId + 'foreign'; await f.db.guild.create({ data: { id: otherGuild } }); t.after(async () => { const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); try { await db.guild.delete({ where: { id: otherGuild } }); } finally { await db.$disconnect(); } });
 await create('foreign', { guildId: otherGuild, question: 'VIP other guild', answer: 'GUILD_PRIVATE' });
 const knowledge = await F.getKnowledge(f.db, { guildId: f.guildId, categoryId: f.de.id }, { language: 'de', question: 'VIP Preis?' });
 assert.ok(knowledge.includes('4,99')); for (const sentinel of ['ENGLISH_PRIVATE','DRAFT_PRIVATE','CATEGORY_PRIVATE','GUILD_PRIVATE']) assert.ok(!knowledge.includes(sentinel));
 assert.equal(await F.getKnowledge(f.db, { guildId: f.guildId, categoryId: f.de.id }, { language: 'de', question: 'Unbekanntes XYZZY' }), '');
});

test('SQLite/Discord: real support request sends only latest question and locally retained language', sqlite, async t => {
 const f = await fixture(t); f.client.log.info = () => {};
 t.after(async () => { const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } }); try { await db.aiTask.deleteMany({ where: { guildId: f.guildId } }); } finally { await db.$disconnect(); } });
 await f.db.guild.update({ where: { id: f.guildId }, data: { aiSupportEnabled: true, aiKnowledge: 'Approved VIP rules' } });
 const item = await f.create({ topic: 'sealed:Hello, my private opening topic is FIRST_PRIVATE' });
 const add = (author, content) => item.channel.add({}, { id: author, bot: false }, new Date(), { content, attachments: new D.Collection() });
 add(f.ids.creator, 'Hello, OLD_CREATOR_PRIVATE'); add(f.ids.user, 'PARTICIPANT_PRIVATE');
 const question = add(f.ids.creator, 'Was kostet VIP? api_key=SECRET_PRIVATE');
 await A.enqueue(f.client, item.ticket.id, question); await f.db.aiTask.update({ where: { id: question.id }, data: { createdAt: new Date(Date.now() - 3000) } });
 let calls = 0;
 await A.tick(f.client, async (db, id, knowledge, context) => {
  assert.deepEqual(Object.keys(context).sort(), ['latestQuestion','responseLanguage']);
  assert.equal(context.responseLanguage, 'en'); assert.ok(!context.latestQuestion.text.includes('SECRET_PRIVATE'));
  return G.generate(db, id, knowledge, context, config, async (_url, options) => {
   calls++; for (const sentinel of ['FIRST_PRIVATE','OLD_CREATOR_PRIVATE','PARTICIPANT_PRIVATE','SECRET_PRIVATE']) assert.ok(!options.body.includes(sentinel), sentinel);
   assert.deepEqual(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text), { text: 'Was kostet VIP? [Zugangsdaten entfernt]', attachments: false });
   return { ok: true, status: 200, headers: new Headers(), json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ action: 'answer', text: 'VIP starts at 4.99 euros.', language: 'en' }) }] } }], usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 25, thoughtsTokenCount: 0 } }) };
  });
 });
 assert.equal(calls, 1); assert.equal((await f.read(item.ticket.id)).aiLanguage, 'en');
});

