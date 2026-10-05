const test = require('node:test');
const assert = require('node:assert/strict');
const { workingHoursStatus: status, sendWorkingHoursNotice: send } = require('../src/lib/working-hours');
const { i18n } = require('./helpers/comfort.cjs');
const { createTranslator } = require('../src/lib/support-texts');
const allDays = (start = '16:00', end = '01:30', timezone = 'Europe/Berlin') => [timezone, ...Array.from({ length: 7 }, () => [start, end])];
const at = iso => new Date(iso);
const next = (settings, now, expected, today) => assert.deepEqual(status(settings, at(now)), { working: false, next: { timestamp: +at(expected) / 1000, today } });

test('daily 16:00–01:30 shifts open today and remain open after midnight, with exact start/end boundaries', () => {
 const hours = allDays();
 next(hours, '2026-10-05T09:00:00Z', '2026-10-05T14:00:00Z', true);
 next(hours, '2026-10-05T13:59:59.999Z', '2026-10-05T14:00:00Z', true);
 for (const instant of ['2026-10-05T14:00:00Z', '2026-10-05T21:59:59Z', '2026-10-05T22:00:00Z', '2026-10-05T23:29:59.999Z']) assert.deepEqual(status(hours, at(instant)), { working: true, next: null }, instant);
 next(hours, '2026-10-05T23:30:00Z', '2026-10-06T14:00:00Z', true);
});

test('the previous day owns its overnight shift, even when today is closed; Saturday wraps to Sunday correctly', () => {
 const mondayOnly = ['Europe/Berlin', null, ['16:00','01:30'], null, null, null, null, null];
 assert.equal(status(mondayOnly, at('2026-10-05T22:45:00Z')).working, true);
 next(mondayOnly, '2026-10-05T23:30:00Z', '2026-10-12T14:00:00Z', false);
 const sundayOnly = ['Europe/Berlin', ['16:00','01:30'], null, null, null, null, null, null];
 next(sundayOnly, '2026-10-03T17:00:00Z', '2026-10-04T14:00:00Z', false);
 assert.equal(status(sundayOnly, at('2026-10-04T22:30:00Z')).working, true);
 next(sundayOnly, '2026-10-04T23:30:00Z', '2026-10-11T14:00:00Z', false);
});

test('ordinary daytime shifts, midnight endings and closed/unconfigured weekdays do not invent a next shift', () => {
 const daytime = allDays('09:00','17:00', 'UTC');
 next(daytime, '2026-10-05T08:59:59Z', '2026-10-05T09:00:00Z', true);
 assert.equal(status(daytime, at('2026-10-05T09:00:00Z')).working, true);
 assert.equal(status(daytime, at('2026-10-05T16:59:59Z')).working, true);
 next(daytime, '2026-10-05T17:00:00Z', '2026-10-06T09:00:00Z', false);
 next(allDays('16:00','00:00','UTC'), '2026-10-06T00:00:00Z', '2026-10-06T16:00:00Z', true);
 for (const empty of [allDays('00:00','00:00'), ['UTC', ...Array(7).fill(null)], ['UTC', [], ['25:00','04:00']]]) assert.deepEqual(status(empty, at('2026-10-05T12:00:00Z')), { working: false, next: null });
});

test('Berlin DST and year/week boundaries preserve local 16:00 starts without assuming a 24-hour day', () => {
 const hours = allDays();
 next(hours, '2026-03-29T10:00:00Z', '2026-03-29T14:00:00Z', true);
 next(hours, '2026-10-25T10:00:00Z', '2026-10-25T15:00:00Z', true);
 assert.equal(status(hours, at('2026-03-28T23:45:00Z')).working, true);
 assert.equal(status(hours, at('2026-10-24T23:15:00Z')).working, true);
 next(hours, '2026-10-24T23:30:00Z', '2026-10-25T15:00:00Z', true);
 next(hours, '2026-12-31T12:00:00Z', '2026-12-31T15:00:00Z', true);
 assert.equal(status(hours, at('2027-01-01T00:15:00Z')).working, true);
});

test('checking a cached or frozen schedule repeatedly never shifts the timezone or mutates any weekday', () => {
 const original = allDays(), frozen = Object.freeze(original.map(value => Array.isArray(value) ? Object.freeze(value) : value));
 for (let i = 0; i < 15; i++) next(frozen, '2026-10-05T12:00:00Z', '2026-10-05T14:00:00Z', true);
 assert.deepEqual(frozen, allDays());
});

test('Discord notices use today at 16:00, respect DE/EN and category overrides, and stay silent during either part of an overnight shift', async () => {
 const payloads = [], channel = { send: async payload => payloads.push(payload) }, guild = { locale: 'de', primaryColour: 'Blue', workingHours: allDays() };
 const translate = createTranslator(i18n, guild, null);
 await send(channel, guild, translate, at('2026-10-05T12:00:00Z'));
 const description = payloads[0].embeds[0].toJSON().description;
 assert.ok(description.includes('heute')); assert.ok(description.includes('<t:' + +at('2026-10-05T14:00:00Z') / 1000 + ':t>'));
 assert.deepEqual(payloads[0].allowedMentions, { parse: [] });
 await send(channel, guild, translate, at('2026-10-05T16:00:00Z'));
 await send(channel, guild, translate, at('2026-10-05T22:45:00Z')); assert.equal(payloads.length, 1);
 const en = { ...guild, locale: 'en-GB' };
 await send(channel, en, createTranslator(i18n, en, null), at('2026-10-05T12:00:00Z'));
 assert.ok(payloads[1].embeds[0].toJSON().description.includes('today'));
 const custom = createTranslator(i18n, en, { textOverrides: { 'ticket.working_hours.today.description': 'Support starts at <t:{timestamp}:t> today.' } });
 await send(channel, en, custom, at('2026-10-05T12:00:00Z')); assert.ok(payloads[2].embeds[0].toJSON().description.startsWith('Support starts at'));
});
