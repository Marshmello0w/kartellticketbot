const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Collection } = require('discord.js');
const { publishCommands, getCommandCache, fetchCommands } = require('../src/lib/commands');
const { fingerprint } = require('../src/lib/command-registry');
const a = '123456789012345678', b = '223456789012345678', applicationId = '323456789012345678';
const originalGuildId = process.env.GUILD_ID;
delete process.env.GUILD_ID;
test.after(() => {
 if (originalGuildId === undefined) delete process.env.GUILD_ID;
 else process.env.GUILD_ID = originalGuildId;
});
function temporaryRegistry(t) {
 const workspace=path.resolve(__dirname,'../..');
 const directory=fs.mkdtempSync(path.join(workspace,'command-registration-test-'));
 assert.ok(directory.startsWith(workspace+path.sep));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 return path.join(directory,'commands.json');
}
function fixture(t, ids = [a, b], failing) {
 const calls=[],fetches=[],errors=[];
 let sequence=0;
 const definitions = new Collection([['new', { name: 'new', description: 'Create a ticket', type: 1 }]]);
 const guilds=new Collection(ids.map(id=>{
  const server=new Collection();
  const commands={
   cache:new Collection(),server,
   fetch:async options=>{fetches.push({id,options});if(id===failing)throw new Error('Missing Access');return new Collection(server)},
   set:async()=>{throw new Error('Bulk overwrite must never be called')},
   create:async body=>{const command={...structuredClone(body),id:id+'-'+(++sequence),guildId:id};calls.push({id,operation:'create',body:structuredClone(body)});server.set(command.id,command);return command},
   edit:async(commandId,body)=>{assert.ok(server.has(commandId));const command={...structuredClone(body),id:commandId,guildId:id};calls.push({id,operation:'edit',body:structuredClone(body)});server.set(commandId,command);return command},
  };
  return [id,{id,commands}];
 }));
 const client={
  guilds:{cache:guilds,fetch:async id=>{if(!guilds.has(id))throw new Error('Unknown Guild');return guilds.get(id)}},
  commands:{components:new Collection([['new',{toJSON:()=>definitions.get('new')}]])},
  application:{id:applicationId,commands:{cache:new Collection(),set:async()=>{throw new Error('Global commands must never be cleared')}}},
  log:{success(){},warn(){},error:error=>errors.push(error)},
 };
 const registryPath=temporaryRegistry(t);
 const publish=guildId=>publishCommands(client,guildId,{registryPath});
 return {client,calls,fetches,errors,guilds,definitions,registryPath,publish};
}
test('guild registration preserves another program’s guild and global commands',async t=>{
 const f=fixture(t);
 const foreign={name:'rank',description:'Rank from another bot program',type:1,id:'foreign',guildId:a};
 f.guilds.get(a).commands.server.set(foreign.id,foreign);
 const global={name:'leaderboard',description:'Global leaderboard',type:1,id:'global'};
 f.client.application.commands.cache.set(global.id,global);
 assert.equal(await f.publish(),2);
 assert.deepEqual(f.calls.map(call=>call.id),[a,b]);
 assert.equal(f.guilds.get(a).commands.server.get(foreign.id),foreign);
 assert.equal(f.client.application.commands.cache.get(global.id),global);
 assert.equal(f.guilds.get(a).commands.cache.get(foreign.id),foreign);
});
test('explicit guild ID and GUILD_ID limit registration to their target',async t=>{
 const f=fixture(t);await f.publish(b);assert.deepEqual(f.fetches.map(call=>call.id),[b]);
 process.env.GUILD_ID=a;
 try{await f.publish();assert.deepEqual(f.fetches.map(call=>call.id),[b,a])}finally{delete process.env.GUILD_ID}
});
test('failed guild fetch cannot modify its commands and does not prevent other guilds',async t=>{
 const f=fixture(t,[a,b],a);await assert.rejects(f.publish(),AggregateError);
 assert.deepEqual(f.calls.map(call=>call.id),[b]);assert.equal(f.guilds.get(a).commands.server.size,0);
});
test('empty, duplicate command lists and invalid guild IDs cannot mutate registrations',async t=>{
 const f=fixture(t);f.client.commands.components.clear();
 await assert.rejects(f.publish(),/No loaded commands/);await assert.rejects(f.publish('wrong'),/server ID/);
 f.client.commands.components.set('one',{toJSON:()=>({name:'same',type:1})});
 f.client.commands.components.set('two',{toJSON:()=>({name:'same',type:1})});
 await assert.rejects(f.publish(),/Duplicate/);assert.equal(f.calls.length,0);assert.equal(f.fetches.length,0);
});
test('restarts skip unchanged commands and update only recorded commands, preserving their IDs',async t=>{
 const f=fixture(t,[a]);await f.publish();const id=f.guilds.get(a).commands.server.first().id;
 await publishCommands({...f.client},a,{registryPath:f.registryPath});assert.equal(f.calls.length,1);
 f.definitions.get('new').description='Updated ticket command';await f.publish();
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].operation,'edit');assert.equal(f.guilds.get(a).commands.server.first().id,id);
 await f.publish();assert.equal(f.calls.length,2);
});
test('legacy identical commands are adopted without an API write, then can be updated',async t=>{
 const f=fixture(t,[a]);
 f.guilds.get(a).commands.server.set('legacy',{...f.definitions.get('new'),id:'legacy',guildId:a,options:[],nsfw:false,nameLocalizations:null,descriptionLocalizations:null,defaultMemberPermissions:null,dmPermission:null});
 await f.publish();assert.equal(f.calls.length,0);
 f.definitions.get('new').options=[{type:3,name:'question',description:'Support question'}];await f.publish();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].operation,'edit');assert.equal(f.guilds.get(a).commands.server.first().id,'legacy');
});
test('same name/type owned by another program is preserved and reported as a conflict',async t=>{
 const f=fixture(t,[a]);const foreign={name:'new',description:'Create something else',type:1,id:'foreign',guildId:a};
 f.guilds.get(a).commands.server.set(foreign.id,foreign);
 f.client.commands.components.set('help',{toJSON:()=>({name:'help',description:'Ticket help',type:1})});
 await assert.rejects(f.publish(),error=>error instanceof AggregateError&&error.errors.some(item=>item.code==='COMMAND_CONFLICT'));
 assert.equal(f.guilds.get(a).commands.server.get(foreign.id),foreign);assert.deepEqual(f.calls.map(call=>call.body.name),['help']);
 assert.equal(getCommandCache(f.client,a).some(command=>command.id===foreign.id),false);
});
test('externally changed or replaced command IDs are not overwritten after restart',async t=>{
 const f=fixture(t,[a]);await f.publish();const manager=f.guilds.get(a).commands,id=manager.server.first().id;
 manager.server.set(id,{...manager.server.get(id),description:'Changed by another program'});
 await assert.rejects(publishCommands({...f.client},a,{registryPath:f.registryPath}),AggregateError);assert.equal(f.calls.length,1);
 manager.server.clear();manager.server.set('replacement',{name:'new',description:'Changed by another program',type:1,id:'replacement',guildId:a});
 await assert.rejects(f.publish(),AggregateError);assert.equal(f.calls.length,1);
});
test('a command lost to another bulk publisher is recreated; different command types can share a name',async t=>{
 const f=fixture(t,[a]);await f.publish();const manager=f.guilds.get(a).commands;manager.server.clear();
 manager.server.set('context',{name:'new',type:2,id:'context',guildId:a});await f.publish();
 assert.equal(manager.server.size,2);assert.equal(manager.server.get('context').type,2);assert.equal(f.calls.length,2);
});
test('command links exclude unrelated commands and use the correct guild, with matching global fallback',async t=>{
 const f=fixture(t);await f.publish();
 assert.equal(getCommandCache(f.client,a).first().guildId,a);assert.equal(getCommandCache(f.client,b).first().guildId,b);
 const global={...f.definitions.get('new'),id:'legacy-global'};
 f.client.application.commands.cache.set(global.id,global);
 f.guilds.get(a).commands.cache.clear();f.guilds.get(a).commands.cache.set('foreign',{name:'rank',type:1,id:'foreign',guildId:a});
 assert.equal(getCommandCache(f.client,a).first().id,global.id);
 f.guilds.get(a).commands.cache.set('conflict',{name:'new',description:'Other command',type:1,id:'conflict',guildId:a});
 assert.equal(getCommandCache(f.client,a).size,0);
});
test('startup with publishing disabled fetches localizations and drops stale cached command IDs',async t=>{
 const f=fixture(t,[a]);f.definitions.get('new').name_localizations={de:'neu'};
 const manager=f.guilds.get(a).commands,command={...f.definitions.get('new'),id:'current',guildId:a};
 manager.server.set(command.id,command);manager.cache.set('stale',{...command,id:'stale'});
 f.client.application.commands.cache.set('stale-global',{...command,id:'stale-global',guildId:undefined});
 const foreignGlobal={name:'rank',description:'Foreign global',type:1,id:'foreign-global'};
 f.client.application.commands.fetch=async options=>{assert.equal(options.withLocalizations,true);return new Collection([[foreignGlobal.id,foreignGlobal]])};
 await fetchCommands(f.client);
 assert.equal(f.calls.length,0);assert.equal(f.fetches[0].options.withLocalizations,true);
 assert.equal(manager.cache.has('stale'),false);assert.equal(f.client.application.commands.cache.has('stale-global'),false);
 assert.equal(f.client.application.commands.cache.get(foreignGlobal.id),foreignGlobal);assert.equal(getCommandCache(f.client,a).first().id,command.id);
});
test('concurrent startup/guild/manual publishers keep both guild ownership records and avoid duplicate writes',async t=>{
 const f=fixture(t);assert.deepEqual(await Promise.all([f.publish(a),f.publish(b),f.publish(a)]),[1,1,1]);
 assert.equal(f.calls.length,2);const registry=JSON.parse(fs.readFileSync(f.registryPath,'utf8'));
 assert.ok(registry.guilds[a]['1:new']);assert.ok(registry.guilds[b]['1:new']);
});
test('broken ownership records fail safely before mutating Discord',async t=>{
 const f=fixture(t,[a]);fs.writeFileSync(f.registryPath,'{invalid');
 await assert.rejects(f.publish(),SyntaxError);assert.equal(f.calls.length,0);assert.equal(f.fetches.length,0);
 fs.writeFileSync(f.registryPath,JSON.stringify({applicationId:'another-account',guilds:{},version:1}));
 await assert.rejects(f.publish(),/Invalid command registry/);assert.equal(f.calls.length,0);
});
test('fingerprints normalize Discord defaults, nested options, localizations and permission bitfields',()=>{
 const api={name:'new',description:'Ticket',type:1,default_member_permissions:'9007199254740993',name_localizations:{de:'neu','en-GB':'new'},options:[{type:1,name:'create',description:'Create',options:[{type:3,name:'name',description:'Name',min_length:0,max_length:40,choices:[{name:'First',value:'1',name_localizations:{de:'Erste'}}]}]}]};
 const received={...api,default_member_permissions:undefined,defaultMemberPermissions:{bitfield:9007199254740993n},name_localizations:undefined,nameLocalizations:{'en-GB':'new',de:'neu'},nsfw:false,options:[{type:1,name:'create',description:'Create',required:false,options:[{type:3,name:'name',description:'Name',required:false,autocomplete:false,minLength:0,maxLength:40,choices:[{name:'First',value:'1',nameLocalizations:{de:'Erste'}}]}]}]};
 assert.equal(fingerprint(api),fingerprint(received));assert.notEqual(fingerprint(api),fingerprint({...received,defaultMemberPermissions:null}));
});
test('real Discord.js uses GET/POST/PATCH for specific guild commands and never PUT or DELETE',async t=>{
 const {Client,ClientApplication,SlashCommandBuilder,ContextMenuCommandBuilder,ApplicationCommandType}=require('discord.js');
 const client=new Client({intents:[]});t.after(()=>client.destroy());
 client.application=new ClientApplication(client,{id:applicationId});client.guilds._add({id:a,name:'Test guild',unavailable:false});
 client.commands={components:new Collection([
  ['new',new SlashCommandBuilder().setName('new').setDescription('Create a ticket').setDMPermission(false).addStringOption(option=>option.setName('topic').setDescription('Topic').setMaxLength(40))],
  ['user',new ContextMenuCommandBuilder().setName('Create ticket for user').setType(ApplicationCommandType.User)],
  ['message',new ContextMenuCommandBuilder().setName('Create ticket from message').setType(ApplicationCommandType.Message)],
 ])};client.log={success(){},warn(){},error(){}};
 const route=`/applications/${applicationId}/guilds/${a}/commands`,calls=[],server=new Map([['foreign',{name:'rank',description:'Other program',type:1,id:'foreign',application_id:applicationId,guild_id:a,version:'1'}]]);
 let sequence=0;
 client.rest.get=async requested=>{assert.equal(requested,route);return [...server.values()].map(row=>structuredClone(row))};
 client.rest.post=async(requested,{body})=>{assert.equal(requested,route);calls.push({method:'POST',body});const row=JSON.parse(JSON.stringify({...body,id:String(423456789012345670n+BigInt(++sequence)),application_id:applicationId,guild_id:a,version:'1',dm_permission:null}));server.set(row.id,row);return row};
 client.rest.patch=async(requested,{body})=>{const id=requested.slice(route.length+1);assert.ok(server.has(id));calls.push({method:'PATCH',body});const row=JSON.parse(JSON.stringify({...body,id,application_id:applicationId,guild_id:a,version:'2',dm_permission:null}));server.set(id,row);return row};
 client.rest.put=client.rest.delete=async()=>{throw new Error('Destructive command request')};
 const registryPath=temporaryRegistry(t);
 assert.equal(await publishCommands(client,a,{registryPath}),3);assert.deepEqual(calls.map(call=>call.body.type||1),[1,2,3]);
 assert.equal(server.size,4);assert.equal(getCommandCache(client,a).size,3);
 await publishCommands(client,a,{registryPath});assert.equal(calls.length,3);
 client.commands.components.get('new').setDescription('Updated ticket command');await publishCommands(client,a,{registryPath});
 assert.equal(calls.length,4);assert.equal(calls.at(-1).method,'PATCH');assert.equal(server.get('foreign').description,'Other program');
});
