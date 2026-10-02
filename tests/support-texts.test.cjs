const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18n = require('@eartharoid/i18n');
const YAML = require('yaml');
const { createTranslator, getCatalog, getSupportMessages, validateOverrides } = require('../src/lib/support-texts');
const i18n = new I18n('en-GB', Object.fromEntries(['en-GB', 'de'].map(locale => [locale, YAML.parse(fs.readFileSync(path.join(__dirname, `../src/i18n/${locale}.yml`), 'utf8'))])));

test('category > guild > standard, with isolated German/English support texts', () => {
 const guild = { locale: 'de', textOverrides: { 'buttons.close.text': 'Erledigt', 'buttons.claim.text': 'Team übernimmt' } };
 const de = createTranslator(i18n, guild, { textOverrides: { 'buttons.close.text': 'Schließen DE' } });
 const en = createTranslator(i18n, guild, { textOverrides: { 'buttons.close.text': 'Close ticket' } });
 assert.equal(de('buttons.close.text'), 'Schließen DE'); assert.equal(en('buttons.close.text'), 'Close ticket');
 assert.equal(en('buttons.claim.text'), 'Team übernimmt'); assert.equal(en('buttons.reject_close_request.text'), 'Ablehnen');
 assert.equal(i18n.getMessage('de', 'buttons.close.text'), 'Schließen');
 assert.equal(createTranslator(i18n, guild, { textOverrides: {} })('buttons.close.text'), 'Erledigt');
});
test('placeholder and plural formatting preserves original i18n behavior', () => {
 const get = createTranslator(i18n, { locale: 'de', textOverrides: {} }, { textOverrides: {
  'ticket.close.staff_request.description': 'Hi {requestedBy}!\nBitte antworte.',
  'misc.member_limit.title': ['Ein Ticket', '%d Tickets'],
 } });
 assert.equal(get('ticket.close.staff_request.description', { requestedBy: '@Team' }), 'Hi @Team!\nBitte antworte.');
 assert.equal(get('misc.member_limit.title', 1), 'Ein Ticket'); assert.equal(get('misc.member_limit.title', 4, 4), '4 Tickets');
});
test('catalog exposes support dialogs and button labels, excluding command names/emojis', () => {
 const keys = new Set(getCatalog(i18n, 'de').map(field => field.key));
 for (const key of ['buttons.close.text', 'ticket.close.staff_request.description', 'modals.feedback.title', 'dm.closed.title', 'commands.slash.add.added']) assert.ok(keys.has(key), key);
 assert.ok(!keys.has('buttons.close.emoji')); assert.ok(!keys.has('commands.slash.close.name'));
 assert.ok(!keys.has('commands.slash.close.options.reason.description'));
});
test('validation rejects unknown keys, long buttons, wrong plural shape and unknown placeholders', () => {
 for (const overrides of [{ 'buttons.close.text': 'x'.repeat(81) }, { 'commands.slash.close.name': 'bad' }, { 'misc.member_limit.title': 'wrong' }, { 'ticket.close.staff_request.description': '{unknown}' }]) assert.throws(() => validateOverrides(i18n, 'de', overrides));
 const custom = { 'ticket.close.staff_request.description': '**Danke**\n{requestedBy}' };
 assert.deepEqual(validateOverrides(i18n, 'de', custom), custom);
 assert.deepEqual(validateOverrides(i18n, 'de', { 'buttons.close.text': null }), {});
});
test('expanded custom templates respect Discord limits', () => {
 const get = createTranslator(i18n, { locale: 'de', textOverrides: {} }, { textOverrides: { 'modals.topic.placeholder': 'Thema {time}' } });
 assert.equal(get('modals.topic.placeholder', { time: 'x'.repeat(500) }).length, 100);
});

test('combined support embed remains within Discord limits', () => {
 const Embed = require('../src/lib/embed');
 const embed = new Embed().setTitle('Title').setDescription('d'.repeat(4096)).setFields(Array.from({ length: 8 }, () => ({ name: 'n'.repeat(256), value: 'v'.repeat(1024) })));
 const json = embed.toJSON();
 const length = json.title.length + (json.description?.length || 0) + json.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
 assert.ok(length <= 6000);
 assert.ok(json.fields.every(field => field.name.length <= 256 && field.value.length <= 1024));
});
test('fresh database resolution applies saved texts without restarting or editing old messages', async () => {
 let text = 'Close';
 const client = { i18n, prisma: { ticket: { findUnique: async () => ({ guild: { locale: 'de', textOverrides: {} }, category: { textOverrides: { 'buttons.close.text': text } } }) } } };
 assert.equal((await getSupportMessages(client, { ticketId: 't' }))('buttons.close.text'), 'Close');
 text = 'Resolved'; assert.equal((await getSupportMessages(client, { ticketId: 't' }))('buttons.close.text'), 'Resolved');
});
