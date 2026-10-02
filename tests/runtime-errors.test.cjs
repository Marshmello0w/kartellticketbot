const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Events, InteractionType, ApplicationCommandType, InteractionCollector, ComponentType } = require('discord.js');
const { ComponentClient, parseComponentId } = require('../src/lib/component-routing');

function load(file, overrides = {}, globals = {}) {
 const absolute = path.join(__dirname, '..', file), module = { exports: {} }, local = createRequire(absolute);
 vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), {
  module, process, AbortSignal, ...globals,
  require: name => Object.hasOwn(overrides, name) ? overrides[name] : local(name),
 });
 return module.exports;
}

function clientFixture(t) {
 // Real DBF lifecycle and local component routers run without a Discord connection.
 const client = new ComponentClient({ intents: [] }, { baseDir: path.join(__dirname, 'helpers/empty-components') });
 client.stdin.interface.close();
 const errors = [];
 client.on('error', error => errors.push(error));
 for (const mod of client.mods.values()) mod.on('error', error => errors.push(error));
 t.after(() => client.destroy());
 return { client, errors };
}

function interaction(kind, customId) {
 return {
  type: kind === 'modals' ? InteractionType.ModalSubmit : InteractionType.MessageComponent,
  customId,
  isButton: () => kind === 'buttons',
  isStringSelectMenu: () => kind === 'menus',
  isUserSelectMenu: () => kind === 'users',
  isAutocomplete: () => false,
 };
}

test('malformed IDs from the log and null JSON are ignored without secondary errors', async t => {
 const { client, errors } = clientFixture(t);
 let routed = 0;
 client.on(Events.InteractionCreate, () => routed++);
 const invalid = ['lb_rank_btn_server1', 'lb_rank_btn_server3', '8d76e45bf5feaa3a8f11f9a14e2a8b26', 'c3cff28ad2539a0550bdf9dec7262ae8', 'null', '[]', '{}', 'true', '42', '"close"', '{"action":null}', '{"action":1}', '{"action":"  "}', '{'];
 for (const kind of ['buttons', 'menus', 'modals', 'users']) {
  for (const id of invalid) client.emit(Events.InteractionCreate, interaction(kind, id));
 }
 await new Promise(setImmediate);
 assert.equal(routed, invalid.length * 4);
 assert.deepEqual(errors, []);
 assert.deepEqual(parseComponentId('{"action":"close","ticket":"123"}'), { action: 'close', ticket: '123' });
});

test('message-scoped collectors still handle the non-JSON IDs used by DM ticket creation', async t => {
 const { client, errors } = clientFixture(t);
 for (const kind of ['buttons', 'menus']) {
  const customId = '123456789012345678';
  const componentType = kind === 'buttons' ? ComponentType.Button : ComponentType.StringSelect;
  const collector = new InteractionCollector(client, {
   componentType, message: { id: 'message' }, time: 1000,
   filter: received => received.customId === customId,
  });
  t.after(() => collector.stop());
  const collected = once(collector, 'collect');
  const selected = { ...interaction(kind, customId), id: 'interaction', componentType, message: { id: 'message' }, user: { id: 'user' } };
  client.emit(Events.InteractionCreate, selected);
  assert.equal((await collected)[0], selected);
  collector.stop();
 }
 assert.deepEqual(errors, []);
});

test('valid ticket buttons, menus and forms retain their payloads and framework success events', async t => {
 const { client, errors } = clientFixture(t);
 for (const kind of ['buttons', 'menus', 'modals']) {
  const payload = { action: 'support', step: 'priority', ticket: '123' };
  const component = interaction(kind, JSON.stringify(payload));
  const calls = [];
  client[kind].components.set('support', { run: async (id, received) => calls.push({ id, received }) });
  const completed = once(client[kind], 'success');
  client.emit(Events.InteractionCreate, component);
  await completed;
  assert.deepEqual(calls[0].id, payload);
  assert.equal(calls[0].received, component);
 }
 assert.deepEqual(errors, []);
});

test('unknown valid actions and actual handler failures retain their normal framework events', async t => {
 const { client, errors } = clientFixture(t);
 const unknown = once(client.buttons, 'unknown');
 const expired = interaction('buttons', '{"action":"removed"}');
 client.emit(Events.InteractionCreate, expired);
 assert.equal((await unknown)[0], expired);
 const expected = new Error('Actual ticket failure');
 client.buttons.components.set('close', { run: async () => { throw expected; } });
 const failed = once(client.buttons, 'error');
 client.emit(Events.InteractionCreate, interaction('buttons', '{"action":"close"}'));
 assert.equal((await failed)[0].error, expected);
 assert.equal(errors.length, 1);
});

test('component load, reload and unload preserve the DBF lifecycle and loaded action dispatch', async t => {
 const { client, errors } = clientFixture(t);
 client.routingCalls = [];
 const file = path.join(__dirname, 'helpers/routing-button.cjs');
 const loaded = once(client.buttons, 'componentLoad');
 await client.buttons.load(file);
 const component = (await loaded)[0];
 assert.equal(component.mod, client.buttons);
 const completed = once(client.buttons, 'success');
 client.emit(Events.InteractionCreate, interaction('buttons', '{"action":"routing-test","ticket":"123"}'));
 await completed;
 assert.equal(client.routingCalls.length, 1);
 assert.equal(client.routingCalls[0].id.ticket, '123');
 const reloaded = once(client.buttons, 'componentLoad');
 component.reload();
 assert.notEqual((await reloaded)[0], component);
 client.buttons.components.get('routing-test').unload();
 assert.equal(client.buttons.components.has('routing-test'), false);
 assert.deepEqual(errors, []);
});

test('slash commands without component IDs and other client events continue to run', async t => {
 const { client, errors } = clientFixture(t);
 let commands = 0, messages = 0;
 client.commands.commands.slash.set('new', { run: async () => commands++ });
 client.on(Events.MessageCreate, () => messages++);
 const completed = once(client.commands, 'success');
 client.emit(Events.InteractionCreate, {
  ...interaction('command'), type: InteractionType.ApplicationCommand,
  commandType: ApplicationCommandType.ChatInput, commandName: 'new',
 });
 await completed;
 client.emit(Events.MessageCreate, { content: 'Hello' });
 assert.equal(commands, 1);
 assert.equal(messages, 1);
 assert.deepEqual(errors, []);
});

test('support handoff selector also ignores malformed IDs and dispatches a valid handoff once', async t => {
 const { client } = clientFixture(t), calls = [];
 const Listener = load('src/listeners/client/supportUserSelect.js', {
  '../../lib/ticket-support-ui': { runSupportUI: async (...args) => calls.push(args) },
 });
 const listener = new Listener(client, { filepath: 'supportUserSelect.js' });
 for (const id of ['null', '[]', 'bad', '{"action":null}']) await listener.run(interaction('users', id));
 assert.equal(calls.length, 0);
 const selected = interaction('users', '{"action":"support","step":"handoff","ticket":"123"}');
 await listener.run(selected);
 assert.equal(calls.length, 1);
 assert.equal(calls[0][0], client);
 assert.equal(calls[0][1].ticket, '123');
 assert.equal(calls[0][2], selected);
});

test('startup listener uses the supported Discord ready event and runs once through DBF', async t => {
 const { client } = clientFixture(t);
 const Ready = load('src/listeners/client/ready.js', {
  '../../lib/ticket-presentation': {}, '../../lib/transcripts': {}, '../../lib/commands': {},
  '../../lib/sync': {}, '../../lib/updates': {}, '../../lib/stats': {}, '../../lib/stale': {},
 });
 let starts = 0;
 Ready.prototype.run = () => starts++;
 const filename = require.resolve('../src/listeners/client/ready'), cached = require.cache[filename];
 require.cache[filename] = { exports: Ready };
 try { await client.events.load(filename); }
 finally {
  if (cached) require.cache[filename] = cached;
  else delete require.cache[filename];
 }
 assert.equal(client.listenerCount('ready'), 0);
 client.emit(Events.ClientReady, client);
 client.emit(Events.ClientReady, client);
 assert.equal(starts, 1);
});

function statsFixture(fetch, databaseFailure) {
 const logs = { warn: [], success: [], error: [], debug: [] };
 const log = Object.fromEntries(Object.keys(logs).map(level => [level, (...args) => logs[level].push(args)]));
 log.info = { cron() {} }; log.verbose = () => {};
 const client = {
  log, user: { id: 'private-bot-id' }, guilds: { cache: new Map([['1', { memberCount: 5 }]]) },
  prisma: {
   guild: { findMany: async () => { if (databaseFailure) throw databaseFailure; return [{ id: '1' }]; } },
   user: { aggregate: async () => ({ _count: 3, _sum: { messageCount: 12 } }) },
  },
 };
 const stats = load('src/lib/stats.js', {
  './misc': { md5: () => 'hashed-bot-id' },
  './threads': { pools: { stats: {} }, quickPool: async (size, name, run) => run({ queue: async callback => callback({ aggregateGuildForHouston: async guild => ({ id: guild.id }) }) }) },
 }, { fetch });
 return { send: () => stats.sendToHouston(client), logs };
}

test('stats connection failures keep the real error and do not attempt to parse it as HTTP JSON', async () => {
 for (const error of [new TypeError('fetch failed'), new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }), new DOMException('Request timed out', 'TimeoutError')]) {
  const f = statsFixture(async () => { throw error; });
  await assert.doesNotReject(f.send());
  assert.equal(f.logs.warn.length, 1);
  assert.equal(f.logs.warn[0][1], error.cause?.message || error.message);
  assert.deepEqual(f.logs.error, []);
  assert.equal(f.logs.debug[0][0], error);
  assert.equal(f.logs.success.length, 0);
 }
});

test('stats HTTP failures handle HTML and JSON error bodies without a JSON parsing failure', async () => {
 for (const response of [new Response('<html>Bad gateway</html>', { status: 502 }), Response.json({ error: 'Rejected' }, { status: 400 })]) {
  response.json = () => { throw new Error('JSON must not be parsed'); };
  const f = statsFixture(async () => response);
  await f.send();
  assert.equal(f.logs.warn.length, 1);
  assert.equal(f.logs.warn[0][1], response.status);
  assert.equal(f.logs.error.length, 0);
  assert.equal(f.logs.success.length, 0);
  assert.equal(response.bodyUsed, true);
 }
});

test('optional statistics preparation failures do not cause an unhandled background rejection', async () => {
 let requests = 0;
 const f = statsFixture(async () => requests++, new Error('Database unavailable'));
 await assert.doesNotReject(f.send());
 assert.equal(requests, 0);
 assert.equal(f.logs.warn[0][1], 'Database unavailable');
});

test('successful statistics are still sent with a timeout and logged once', async () => {
 let requests = 0;
 const f = statsFixture(async (url, options) => {
  requests++;
  assert.equal(url, 'https://stats.discordtickets.app/api/v4/houston');
  assert.equal(options.method, 'POST');
  assert.ok(options.signal instanceof AbortSignal);
  const report = JSON.parse(options.body);
  assert.equal(report.id, 'hashed-bot-id');
  assert.equal(report.activated_users, 3);
  assert.equal(report.guilds.length, 1);
  return Response.json({ success: true });
 });
 await f.send();
 assert.equal(requests, 1);
 assert.equal(f.logs.success.length, 1);
 assert.deepEqual(f.logs.warn, []);
 assert.deepEqual(f.logs.error, []);
});
