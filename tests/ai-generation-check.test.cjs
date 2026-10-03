const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const G = require('../src/lib/gemini-support');
const { describeReason } = require('../src/lib/ai-diagnostics');
const config = { freeKey: 'synthetic-free-key'.repeat(3), paidKey: 'synthetic-paid-key'.repeat(3), monthlyMicros: 9500000, renewalDay: 1 };
const now = new Date('2026-10-04T00:00:00Z');
const database = () => ({ aiProvider: { findUnique: async () => null, upsert: async () => assert.fail('Unexpected cooldown') } });
const response = (status, data) => ({ ok: status === 200, status, headers: new Headers(), json: async () => data });
const candidate = (value, finishReason = 'STOP') => ({ candidates: [{ finishReason, content: { parts: [{ thought: true, text: 'PRIVATE_THOUGHT' }, { text: typeof value === 'string' ? value : JSON.stringify(value) }] } }] });
const answer = { action: 'answer', text: 'ok', language: 'en' };

test('actual free test uses a tiny fixed question and the support format, without paid access, ticket input or charges', async () => {
 let calls = 0;
 const result = await G.checkFreeGeneration(database(), config, async (url, options) => {
  calls++; assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/' + G.MODEL + ':generateContent');
  assert.equal(options.method, 'POST'); assert.equal(options.headers['x-goog-api-key'], config.freeKey);
  const body = JSON.parse(options.body);
  assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), { text: 'test', attachments: false });
  assert.equal(body.generationConfig.maxOutputTokens, 64); assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseSchema, G.bodyFor('', { responseLanguage: 'en' }).generationConfig.responseSchema);
  assert.ok(body.systemInstruction.parts[0].text.includes('language code en')); assert.equal(body.tools, undefined);
  return response(200, candidate(answer));
 }, now);
 assert.equal(calls, 1); assert.equal(result.free.ok, true); assert.equal(result.paid, null); assert.equal(result.mode, 'generation');
 assert.equal(+result.checkedAt, +now); assert.ok(!/PRIVATE_THOUGHT|synthetic-|"text"/.test(JSON.stringify(result)));
});

test('simultaneous checks share one request, cached successes and failures expire, and key changes invalidate the cache', async () => {
 const db = database(); let calls = 0, release;
 const gate = new Promise(resolve => { release = resolve; });
 const fetcher = async () => { calls++; await gate; return response(403, { error: { details: [{ reason: 'USER_PROJECT_DENIED' }] } }); };
 const first = G.checkFreeGeneration(db, config, fetcher, now), second = G.checkFreeGeneration(db, config, fetcher, now);
 release(); const results = await Promise.all([first, second]);
 assert.equal(calls, 1); assert.equal(results[0].free.code, 'PROVIDER_PROJECT_DENIED'); assert.deepEqual(results[0], results[1]);
 await G.checkFreeGeneration(db, config, fetcher, new Date(+now + 59000)); assert.equal(calls, 1);
 await G.checkFreeGeneration(db, config, fetcher, new Date(+now + 60000)); assert.equal(calls, 2);
 await G.checkFreeGeneration(db, { ...config, freeKey: 'changed-free-key'.repeat(3) }, fetcher, new Date(+now + 60001)); assert.equal(calls, 3);
});

test('metadata access can succeed while generation returns a private, precise project/identity error', async () => {
 for (const [details, message, code] of [
  [[{ reason: 'USER_PROJECT_DENIED', metadata: { private: config.freeKey } }], 'Your project has been denied access ' + config.paidKey, 'PROVIDER_PROJECT_DENIED'],
  [[{ reason: 'IAM_PERMISSION_DENIED' }], config.freeKey, 'PROVIDER_IAM_DENIED'],
  [[{ reason: 'PROJECT_DISABLED' }], config.freeKey, 'PROVIDER_PROJECT_DISABLED'],
  [[], 'Your API key is blocked ' + config.freeKey, 'PROVIDER_KEY_BLOCKED'],
 ]) {
  const fetcher = async (_url, options) => options.method === 'GET'
   ? response(200, { supportedGenerationMethods: ['generateContent'] })
   : response(403, { error: { details, message } });
  assert.equal((await G.checkConnection(config, fetcher)).free.ok, true);
  const generated = await G.checkFreeGeneration(database(), config, fetcher, now);
  assert.equal(generated.free.code, code); assert.equal(generated.free.ok, false);
  assert.ok(!JSON.stringify(generated).includes(config.freeKey)); assert.ok(!JSON.stringify(generated).includes(config.paidKey));
 }
});

test('the test never retries an outage, switches to paid or sends a request without valid configuration', async () => {
 let calls = 0;
 const checked = await G.checkFreeGeneration(database(), config, async (_url, options) => {
  calls++; assert.equal(options.headers['x-goog-api-key'], config.freeKey); return response(503, {});
 }, now);
 assert.equal(checked.free.code, 'PROVIDER_HTTP_503'); assert.equal(calls, 1);
 assert.equal((await G.checkFreeGeneration(database(), { error: 'NOT_CONFIGURED' }, async () => assert.fail('No key'), now)).free.code, 'CONFIG');
});

test('SQLite: a free test quota rejection persists its cooldown over restart, never bills, and prevents immediate support probes', { skip: !process.env.TEST_DATABASE_URL }, async t => {
 const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 await db.aiCharge.deleteMany(); await db.aiBudget.deleteMany(); await db.aiProvider.deleteMany();
 t.after(async () => { await db.aiProvider.deleteMany(); await db.$disconnect(); });
 let calls = 0;
 const result = await G.checkFreeGeneration(db, config, async () => { calls++; return response(429, { error: { details: [{ retryDelay: '120s' }] } }); }, now);
 assert.equal(result.free.code, 'PROVIDER_HTTP_429'); assert.equal(calls, 1); assert.equal(await db.aiCharge.count(), 0); assert.equal(await db.aiBudget.count(), 0);
 const restarted = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 try {
  const blocked = await G.checkFreeGeneration(restarted, config, async () => assert.fail('Cooldown'), new Date(+now + 61000));
  assert.equal(blocked.free.code, 'QUOTA');
  assert.equal((await G.generate(restarted, 'blocked-support', 'FAQ', { responseLanguage: 'en' }, { ...config, paidKey: null }, async () => assert.fail('Cooldown'), now)).reason, 'QUOTA');
 } finally { await restarted.$disconnect(); }
});

test('support and the generation probe distinguish model handoff, filters, truncation, malformed output and wrong language without leaking output', async () => {
 const cases = [
  [{ promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: config.freeKey } }, 'MODEL_BLOCKED'],
  [{ candidates: [] }, 'MODEL_NO_RESPONSE'],
  [candidate('PRIVATE_OUTPUT', 'MAX_TOKENS'), 'MODEL_LIMIT'],
  [candidate('PRIVATE_OUTPUT', 'SAFETY'), 'MODEL_BLOCKED'],
  [candidate('PRIVATE_OUTPUT', 'RECITATION'), 'MODEL_BLOCKED'],
  [candidate('PRIVATE_OUTPUT', 'FUTURE_REASON'), 'MODEL_FINISH'],
  [{ candidates: [{ finishReason: 'STOP', content: { parts: null } }] }, 'MODEL_INVALID_RESPONSE'],
  [candidate('PRIVATE_OUTPUT'), 'MODEL_JSON'],
  [candidate('null'), 'MODEL_INVALID_RESPONSE'],
  [candidate({ ...answer, text: '' }), 'MODEL_INVALID_RESPONSE'],
  [candidate({ ...answer, text: 'x'.repeat(1601) }), 'MODEL_INVALID_RESPONSE'],
  [candidate({ ...answer, language: 'de' }), 'MODEL_LANGUAGE'],
  [candidate({ ...answer, language: 'invalid' }), 'MODEL_LANGUAGE'],
  [candidate({ ...answer, action: 'human', text: 'PRIVATE_HANDOFF' }), 'MODEL_HANDOFF'],
 ];
 for (const [data, reason] of cases) {
  let calls = 0;
  const fetcher = async () => { calls++; return response(200, data); };
  const generated = await G.generate(database(), 'test-' + reason, 'Approved FAQ', { responseLanguage: 'en' }, config, fetcher, now);
  assert.equal(generated.action, 'human'); assert.equal(generated.reason, reason); assert.equal(calls, 1);
  const checked = await G.checkFreeGeneration(database(), config, fetcher, now);
  assert.equal(checked.free.code, reason); assert.equal(checked.free.ok, false); assert.equal(calls, 2);
  assert.ok(!JSON.stringify([generated, checked, describeReason(reason)]).includes('PRIVATE_'));
  assert.ok(!JSON.stringify(checked).includes(config.freeKey));
 }
 const valid = await G.generate(database(), 'greeting', '', { responseLanguage: 'en', latestQuestion: { text: 'uwu' } }, config, async () => response(200, candidate({ ...answer, text: 'Hello! What can I help you with?' })), now);
 assert.equal(valid.action, 'answer'); assert.equal(valid.text, 'Hello! What can I help you with?'); assert.equal(valid.reason, undefined);
});
