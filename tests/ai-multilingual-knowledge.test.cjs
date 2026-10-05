const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { fixture, load, D } = require('./helpers/comfort.cjs');
const Input = require('../src/lib/ai-input');
const Search = require('../src/lib/faq-search');
const G = require('../src/lib/gemini-support');
const crypto = { queue: async fn => fn({ encrypt: value => 'sealed:' + value, decrypt: value => value.slice(7) }) };
const L = load('src/lib/ai-language.js', { './threads': { pools: { crypto } } });
const A = load('src/lib/ai-support.js', { './threads': { pools: { crypto } }, './ai-language': L });
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const config = { freeKey: 'synthetic-free-key'.repeat(3), paidKey: null, monthlyMicros: 0, renewalDay: 1 };
const database = () => ({ aiProvider: { findUnique: async () => null } });
const response = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test('short DE/EN support questions and game-name typos are recognized without using FAQ language', () => {
 for (const question of ['is hamvey banned on server?', 'is humvee banned on server?', 'humvee banned?', 'Can you remove the grenade launcher?', 'How does it work?', 'what is VIP?', 'how much VIP?', 'Why am I banned?']) {
  assert.equal(Input.language(question, 'de'), 'en', question);
 }
 for (const question of ['Sind Humvees erlaubt?', 'Könnt ihr das entfernen?', 'Warum wurde ich gebannt?', 'Was ist VIP?']) {
  assert.equal(Input.language(question, 'en'), 'de', question);
 }
 assert.equal(Input.language('Quelle est la durée du VIP?', 'de'), 'fr');
 for (const text of ['VIP', 'Humvee', 'uwu', 'hi', 'https://example.org/english-help']) {
  assert.equal(Input.detectedLanguage(text), null, text);
  assert.equal(Input.language(text, 'en'), 'en'); assert.equal(Input.language(text, 'de'), 'de');
 }
 assert.equal(Input.supportLanguage({ responseLanguage: 'de', creatorFirstText: 'is hamvey banned on server?' }), 'de');
});

test('FAQ retrieval connects DE/EN support vocabulary, prefers equally relevant translations and keeps category overrides', () => {
 const entries = [
  { id: 'global', language: 'de', categoryId: null, question: 'Sind Humvees erlaubt?', answer: 'Veralteter Serverstandard' },
  { id: 'category', language: 'de', categoryId: 12, question: 'Sind Humvees erlaubt?', answer: 'Humvees sind erlaubt, auch mit MG oder Minigun.' },
  { id: 'hours', language: 'de', categoryId: null, question: 'Wann ist der Support erreichbar?', answer: 'Der Support ist täglich von 16:00 bis 01:30 Uhr erreichbar.' },
 ];
 const picked = Search.select(entries, 'is hamvey banned on server?', 12, 'en');
 assert.equal(picked[0].id, 'category'); assert.ok(!picked.some(entry => entry.id === 'global'));
 assert.ok(Search.select(entries, 'What are your support hours?', 12, 'en').some(entry => entry.id === 'hours'));
 const translations = ['de','en'].map(language => ({ language, categoryId: null, question: 'VIP?', answer: '4.99' }));
 assert.equal(Search.select(translations, 'VIP', 12, 'en')[0].language, 'en');
 assert.equal(Search.select(translations, 'VIP', 12, 'de')[0].language, 'de');
 assert.ok(Buffer.byteLength(Search.format(picked), 'utf8') <= Search.MAX_BYTES);
});

test('generation translates knowledge in one request and rejects mislabeled answer text without a second request', async () => {
 const cases = [
  ['en', 'Humvees sind erlaubt.', 'No, Humvees are allowed on our server.', true],
  ['de', 'Humvees are allowed.', 'Ja, Humvees sind erlaubt.', true],
  ['en', 'Humvees sind erlaubt.', 'Ja, Humvees sind erlaubt.', false],
  ['de', 'Humvees are allowed.', 'No, Humvees are allowed on our server.', false],
  ['en', 'Original: Humvees sind erlaubt.', 'Humvees are allowed.\n> Humvees sind erlaubt.\n```\nHumvees sind erlaubt.\n```', true],
  ['en', 'VIP price: 4.99', '4.99', true],
 ];
 for (const [language, knowledge, text, ok] of cases) {
  let calls = 0;
  const result = await G.generate(database(), 'language-check', knowledge, { responseLanguage: language, latestQuestion: { text: 'Humvee?' } }, config, async (_url, options) => {
   calls++; const body = JSON.parse(options.body), instruction = body.systemInstruction.parts[0].text;
   assert.ok(instruction.includes('language code ' + language)); assert.ok(instruction.includes('translate their facts into the response language'));
   assert.ok(instruction.includes(knowledge)); assert.deepEqual(body.generationConfig.responseSchema.properties.language.enum, [language]);
   return response({ action: 'answer', text, language });
  });
  assert.equal(calls, 1); assert.equal(result.action, ok ? 'answer' : 'human', text);
  if (!ok) assert.equal(result.reason, 'MODEL_LANGUAGE');
 }
});

test('SQLite/Discord: an English short question uses approved German analyzer FAQ and retains English over follow-ups/restart', sqlite, async t => {
 const f = await fixture(t); f.client.log.info = () => {};
 await f.db.guild.update({ where: { id: f.guildId }, data: { aiSupportEnabled: true, aiKnowledge: 'Bulkhead entwickelt WARDOGS.' } });
 const item = await f.create({ categoryId: f.en.id });
 await f.db.faqEntry.create({ data: {
  id: f.guildId + '-vehicles', guildId: f.guildId, categoryId: null, categoryName: 'Server', sourceTicketId: 'old-source', sourceTicketNumber: 1, jobId: 'analyzer', status: 'approved', language: 'de',
  question: 'Sind Humvees mit MG oder Minigun auf unseren Servern erlaubt?', answer: 'Ja, Humvees sind auf unseren Servern erlaubt, auch mit MG oder Minigun.', evidence: '[]',
 } });
 const add = (actor, content) => item.channel.add({}, { id: actor, bot: false }, new Date(), { content, attachments: new D.Collection() });
 add(f.ids.user, 'Hallo, ich bin ein anderer Teilnehmer.');
 const question = add(f.ids.creator, 'is hamvey banned on server?'); await A.enqueue(f.client, item.ticket.id, question);
 await f.db.aiTask.update({ where: { id: question.id }, data: { createdAt: new Date(Date.now() - 3000) } });
 let calls = 0;
 await A.tick(f.client, async (db, id, knowledge, context) => {
  assert.equal(context.responseLanguage, 'en'); assert.ok(knowledge.includes('Bulkhead entwickelt')); assert.ok(knowledge.includes('auch mit MG oder Minigun'));
  return G.generate(db, id, knowledge, context, config, async (_url, options) => {
   calls++; const body = JSON.parse(options.body);
   assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), { text: 'is hamvey banned on server?', attachments: false });
   assert.ok(!options.body.includes('anderer Teilnehmer')); assert.equal(body.generationConfig.maxOutputTokens, 384);
   return response({ action: 'answer', text: 'No, Humvees with an MG or minigun are allowed on our servers.', language: 'en' });
  });
 });
 assert.equal(calls, 1); assert.equal((await f.read(item.ticket.id)).aiLanguage, 'en');
 const sent = item.channel.messages.cache.last(); assert.ok(sent.content.startsWith('No, Humvees')); assert.equal(sent.embeds.length, 0);
 assert.equal(sent.components[0].components[0].data.label, 'Request support');
 const followUp = add(f.ids.creator, 'Und mit Minigun?'); await A.enqueue(f.client, item.ticket.id, followUp);
 await f.db.aiTask.update({ where: { id: followUp.id }, data: { createdAt: new Date(Date.now() - 3000) } });
 await A.tick(f.client, async (_db, _id, _knowledge, context) => { assert.equal(context.responseLanguage, 'en'); return { action: 'answer', text: 'Yes, Humvees with a minigun are allowed.', language: 'en' }; });
 const restarted = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 try { assert.equal((await restarted.ticket.findUnique({ where: { id: item.ticket.id } })).aiLanguage, 'en'); } finally { await restarted.$disconnect(); }
});

test('SQLite/Discord: configured English overrides a German opener and German support can use approved English FAQ', sqlite, async t => {
 const f = await fixture(t); f.client.log.info = () => {};
 await f.db.guild.update({ where: { id: f.guildId }, data: { aiSupportEnabled: true, aiKnowledge: '' } });
 await f.db.category.update({ where: { id: f.en.id }, data: { aiResponseLanguage: 'en' } });
 await f.db.faqEntry.create({ data: {
  id: f.guildId + '-vehicles', guildId: f.guildId, categoryId: null, categoryName: 'Server', sourceTicketId: 'old-source', sourceTicketNumber: 1, jobId: 'analyzer', status: 'approved', language: 'en',
  question: 'Are Humvees allowed on your servers?', answer: 'Humvees are allowed on our servers.', evidence: '[]',
 } });
 const german = await f.create(), english = await f.create({ categoryId: f.en.id });
 for (const item of [german, english]) {
  const question = item.channel.add({}, { id: f.ids.creator, bot: false }, new Date(), { content: 'Sind Humvees erlaubt?', attachments: new D.Collection() });
  await A.enqueue(f.client, item.ticket.id, question); await f.db.aiTask.update({ where: { id: question.id }, data: { createdAt: new Date(Date.now() - 3000) } });
 }
 const seen = [];
 await A.tick(f.client, async (db, id, knowledge, context) => {
  seen.push(context.responseLanguage); assert.ok(knowledge.includes('Humvees are allowed'));
  return G.generate(db, id, knowledge, context, config, async () => response({ action: 'answer', text: context.responseLanguage === 'en' ? 'Yes, Humvees are allowed.' : 'Ja, Humvees sind erlaubt.', language: context.responseLanguage }));
 });
 assert.deepEqual(seen, ['de','en']); assert.ok(german.channel.messages.cache.last().content.startsWith('Ja, Humvees')); assert.ok(english.channel.messages.cache.last().content.startsWith('Yes, Humvees'));
});
