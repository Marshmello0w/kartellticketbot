const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const YAML = require('yaml');
const I18n = require('@eartharoid/i18n');
const root = path.resolve(__dirname, '..');
const config = { logs: { level: 'info', files: { enabled: false } } };

function load(file, overrides = {}, globals = {}) {
 const absolute = path.join(root, file), module = { exports: {} }, local = createRequire(absolute);
 vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), { module, __dirname: path.dirname(absolute), process, console, ...globals, require: name => Object.hasOwn(overrides, name) ? overrides[name] : local(name) });
 return module.exports;
}

function clientFixture(invalidLocale = false) {
 const calls = { prisma: 0, login: 0, disconnect: 0, destroy: 0 }, boot = { ...config, logs: { ...config.logs } };
 const log = { notice() {}, info() {}, warn() {}, error() {}, debug() {} };
 class ComponentClient { constructor() { this.commands = {}; } async login() { calls.login++; return 'logged-in'; } async destroy() { calls.destroy++; return 'destroyed'; } }
 class PrismaClient { constructor() { calls.prisma++; } $on() {} async $disconnect() { calls.disconnect++; } }
 const mockFs = { ...fs, readFileSync: (file, options) => {
  if (String(file).replaceAll('\\', '/').endsWith('user/config.yml')) return YAML.stringify(config);
  if (String(file).endsWith('banned-guilds.txt')) return '';
  if (invalidLocale && String(file).endsWith('bg.yml')) return '{}\n\ncommands:\n  slash: {}\n';
  return fs.readFileSync(file, options);
 } };
 const Client = load('src/client.js', { './lib/component-routing': { ComponentClient }, '@prisma/client': { PrismaClient }, fs: mockFs, './lib/logger': () => ({ ...log }), './lib/tickets/manager': class {} }, { process: { env: { DB_PROVIDER: 'mysql', PUBLIC_BOT: 'true' } } });
 return { Client, calls, boot, log };
}

test('all shipped language files parse exactly as at startup and create the FAQ command', () => {
 const locales = Object.fromEntries(fs.readdirSync(path.join(root, 'src/i18n')).filter(file => file.endsWith('.yml')).map(file => [file.slice(0, -4), YAML.parse(fs.readFileSync(path.join(root, 'src/i18n', file), 'utf8'))]));
 const i18n = new I18n('en-GB', locales);
 for (const locale of i18n.locales) assert.equal(typeof i18n.getMessage(locale, 'commands.slash.faq-analyze.started'), 'string');
 const Command = require('../src/commands/slash/faq-analyze'); const command = new Command({ i18n, mods: new Map([['commands', {}]]) }, {});
 assert.equal(command.toJSON().name, 'faq-analyze');
 const log = require('../src/lib/logger')(config); assert.equal(typeof log.notice, 'function'); assert.equal(typeof Object.assign({}, log).notice, 'function');
});

test('language checker rejects malformed YAML and duplicate keys instead of passing a partial document', t => {
 const directory = fs.mkdtempSync(path.join(root, '../startup-check-')); t.after(() => {
  const target = fs.realpathSync(directory); assert.equal(path.dirname(target), fs.realpathSync(path.resolve(root, '..'))); assert.ok(path.basename(target).startsWith('startup-check-'));
  fs.rmSync(target, { recursive: true, force: true });
 });
 const languages = path.join(directory, 'src/i18n'); fs.mkdirSync(languages, { recursive: true });
 for (const input of ['{}\n\ncommands:\n  slash: {}\n', 'commands:\n  slash: {}\ncommands:\n  slash: {}\n']) {
  fs.writeFileSync(path.join(languages, 'bg.yml'), input);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-i18n.js')], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.ok(result.stderr.includes('Failed with')); assert.ok(result.stdout.includes('file=src/i18n/bg.yml'));
 }
 fs.writeFileSync(path.join(languages, 'bg.yml'), 'commands:\n  slash: {}\n');
 assert.equal(spawnSync(process.execPath, [path.join(root, 'scripts/check-i18n.js')], { cwd: directory }).status, 0);
});

test('real client initialization retains bootstrap logger/config references across reloads', async () => {
 const f = clientFixture(), client = new f.Client(f.boot, f.log);
 await client.initialized; assert.equal(client.log, f.log); assert.equal(client.config, f.boot); assert.equal(typeof client.log.notice, 'function');
 assert.equal(await client.login('fake-token'), 'logged-in'); assert.equal(f.calls.prisma, 1); assert.equal(f.calls.login, 1);
 await client.init(true); assert.equal(client.log, f.log); assert.equal(client.config, f.boot); await client.destroy(); assert.equal(f.calls.disconnect, 1);
});

test('failed language initialization rejects login with the original error and keeps logging available', async () => {
 const f = clientFixture(true), client = new f.Client(f.boot, f.log);
 await assert.rejects(client.login('fake-token'), error => error.name === 'YAMLParseError' && error.message.includes('Unexpected scalar token'));
 assert.equal(f.calls.prisma, 0); assert.equal(f.calls.login, 0); assert.equal(client.log, f.log); assert.equal(typeof client.log.notice, 'function');
 assert.equal(await client.destroy(), 'destroyed'); assert.equal(f.calls.disconnect, 0);
});

test('login waits for initialization before opening the database or Discord connection', async () => {
 const f = clientFixture(); let release; const gate = new Promise(resolve => { release = resolve; });
 f.Client.prototype.init = async () => gate;
 const client = new f.Client(f.boot, f.log), pending = client.login('fake-token');
 assert.equal(f.calls.prisma, 0); assert.equal(f.calls.login, 0); release(); await pending; assert.equal(f.calls.prisma, 1); assert.equal(f.calls.login, 1); await client.destroy();
});

function entryFixture(failure, where, brokenLog = false) {
 const errors = [], exits = [], handlers = new Map(); let httpCalls = 0;
 const log = { notice() {}, warn() {}, info() {}, error: error => errors.push(error) };
 const fakeProcess = { env: {}, versions: process.versions, version: process.version, platform: process.platform, cwd: () => root, on: (event, handler) => handlers.set(event, handler), exit: code => exits.push(code) };
 class Client {
  constructor(bootstrap, logger) { assert.equal(logger, log); this.config = bootstrap; this.log = brokenLog ? {} : logger; }
  async login() { if (where === 'login') throw failure; }
 }
 load('src/index.js', { './lib/banner': () => {}, './env': { load() {} }, './lib/prepare-database': () => {}, './lib/logger': () => log, './client': Client, './http': async () => { httpCalls++; if (where === 'http') throw failure; }, fs: { readFileSync: () => YAML.stringify(config), cpSync() {} } }, { process: fakeProcess, console: { log() {}, error: (_origin, error) => errors.push(error) } });
 return { errors, exits, handlers, httpCalls: () => httpCalls };
}

test('entrypoint reports startup failures and stops before the portal, even if the logger is broken', async () => {
 const failure = new Error('Original locale startup error');
 for (const broken of [false, true]) {
  const f = entryFixture(failure, 'login', broken); await new Promise(setImmediate);
  assert.ok(f.errors.includes(failure)); assert.deepEqual(f.exits, [1]); assert.equal(f.httpCalls(), 0);
  const later = new Error('Original runtime error'); assert.doesNotThrow(() => f.handlers.get('uncaughtException')(later, 'uncaughtException')); assert.ok(f.errors.includes(later));
 }
});

test('entrypoint awaits portal startup and catches its rejected promise', async () => {
 const failure = new Error('Portal failed to listen'), f = entryFixture(failure, 'http'); await new Promise(setImmediate);
 assert.equal(f.httpCalls(), 1); assert.ok(f.errors.includes(failure)); assert.deepEqual(f.exits, [1]);
});
