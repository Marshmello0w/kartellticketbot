const test = require('node:test');
const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const { publishCommands, getCommandCache } = require('../src/lib/commands');
const a = '123456789012345678', b = '223456789012345678';
const originalGuildId = process.env.GUILD_ID;
delete process.env.GUILD_ID;
test.after(() => {
 if (originalGuildId === undefined) delete process.env.GUILD_ID;
 else process.env.GUILD_ID = originalGuildId;
});
function fixture(ids = [a, b], failing) {
 const calls = [];
 const guilds = new Collection(ids.map(id => [id, {
  id, commands: {
   cache: new Collection(),
   set: async body => {
    calls.push({ id, body });
    if (id === failing) throw new Error('Missing Access');
    return new Collection([[id + '-new', { name: 'new', id: id + '-new', guildId: id }]]);
   },
  },
 }]));
 const client = {
  guilds: { cache: guilds, fetch: async id => { if (!guilds.has(id)) throw new Error('Unknown Guild'); return guilds.get(id); } },
  commands: { components: new Collection([['new', { toJSON: () => ({ name: 'new', description: 'Create a ticket', type: 1 }) }]]) },
  application: { commands: { cache: new Collection(), set: async body => { calls.push({ global: true, body }); } } },
  log: { success() {}, warn() {}, error() {} },
 };
 return { client, calls };
}
test('commands are sent to every guild and globals are removed only after success', async () => {
 const f = fixture();
 assert.equal(await publishCommands(f.client), 2);
 assert.deepEqual(f.calls.map(c => c.id || 'global'), [a, b, 'global']);
 assert.equal(f.calls[0].body[0].name, 'new');
 assert.equal(f.calls[2].body.length, 0);
});
test('explicit guild ID scopes publication to that server', async () => {
 const f = fixture();
 await publishCommands(f.client, b);
 assert.deepEqual(f.calls.map(c => c.id), [b]);
});
test('GUILD_ID environment setting selects the target guild', async () => {
 const f = fixture(); process.env.GUILD_ID = a;
 try { await publishCommands(f.client); assert.deepEqual(f.calls.map(c => c.id), [a]); }
 finally { delete process.env.GUILD_ID; }
});
test('registration failure preserves global commands and still attempts other guilds', async () => {
 const f = fixture([a, b], a);
 await assert.rejects(publishCommands(f.client), AggregateError);
 assert.deepEqual(f.calls.map(c => c.id), [a, b]);
});
test('empty command list and invalid guild IDs cannot erase registrations', async () => {
 const f = fixture(); f.client.commands.components.clear();
 await assert.rejects(publishCommands(f.client), /No loaded commands/);
 await assert.rejects(publishCommands(f.client, 'wrong'), /server ID/);
 assert.equal(f.calls.length, 0);
});
test('command links resolve guild-specific IDs without crossing server caches', async () => {
 const f = fixture(); await publishCommands(f.client);
 assert.equal(getCommandCache(f.client, a).find(c => c.name === 'new').id, a + '-new');
 assert.equal(getCommandCache(f.client, b).find(c => c.name === 'new').id, b + '-new');
});
test('Discord.js sends slash and context-menu commands to the guild REST route', async () => {
 const { Client, ClientApplication, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
 const client = new Client({ intents: [] });
 client.application = new ClientApplication(client, { id: '323456789012345678' });
 client.guilds._add({ id: a, name: 'Test guild', unavailable: false });
 client.commands = { components: new Collection([
  ['new', new SlashCommandBuilder().setName('new').setDescription('Create a ticket')],
  ['user', new ContextMenuCommandBuilder().setName('Create ticket for user').setType(ApplicationCommandType.User)],
  ['message', new ContextMenuCommandBuilder().setName('Create ticket from message').setType(ApplicationCommandType.Message)],
 ]) };
 client.log = { success() {}, warn() {}, error() {} };
 const calls = [];
 client.rest.put = async (route, { body }) => {
  calls.push({ route, body });
  return JSON.parse(JSON.stringify(body.map((command, index) => ({ ...command, id: '42345678901234567' + index, application_id: client.application.id, guild_id: a, version: '1' }))));
 };
 try {
  assert.equal(await publishCommands(client, a), 3);
  assert.equal(calls[0].route, `/applications/${client.application.id}/guilds/${a}/commands`);
  assert.deepEqual(calls[0].body.map(c => c.type || 1), [1, 2, 3]);
  assert.equal(getCommandCache(client, a).size, 3);
 } finally { await client.destroy(); }
});
