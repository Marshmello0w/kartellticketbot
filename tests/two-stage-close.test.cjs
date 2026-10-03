const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const D = require('discord.js');
const YAML = require('yaml');
const I18n = require('@eartharoid/i18n');
const P = require('../src/lib/ticket-presentation');
const close = require('../src/lib/ticket-close-channel');
const actions = require('../src/lib/ticket-actions');
const { getCatalog, getSupportMessages, validateOverrides } = require('../src/lib/support-texts');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const i18n = new I18n('en-GB', Object.fromEntries(['de','en-GB'].map(locale => [locale,YAML.parse(fs.readFileSync(path.join(__dirname,'../src/i18n/'+locale+'.yml'),'utf8'))])));
function load(file, overrides = {}) {
 const absolute = path.join(__dirname,'..',file), module = {exports:{}}, local = createRequire(absolute);
 vm.runInNewContext(fs.readFileSync(absolute,'utf8'), {module, Buffer, Date, process, setTimeout: fn => setTimeout(fn,0), require: name => overrides[name] || local(name)});
 return module.exports;
}
let sequence = 0;
async function fixture(t) {
 const db = new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});
 db.$use(require('../src/lib/middleware/prisma-sqlite'));
 const guildId = String(840000000000000000n+BigInt(Date.now())*100n+BigInt(++sequence)*10n);
 const id = n => String(BigInt(guildId)+BigInt(n));
 const ids = {creator:id(1),staff:id(2),admin:id(3),other:id(4),bot:id(5),role:id(6),ticket:id(7)};
 await db.guild.create({data:{id:guildId,locale:'de',archive:true,driveArchiveEnabled:false}});
 await db.user.createMany({data:[ids.creator,ids.staff,ids.admin,ids.other].map(id=>({id}))});
 const category = await db.category.create({data:{guildId,name:'Support',channelName:'ticket-{number}',description:'Support',discordCategory:id(8),emoji:'🎫',openingMessage:'Hello',staffRoles:[ids.role]}});
 const ticket = await db.ticket.create({data:{id:ids.ticket,guildId,categoryId:category.id,createdById:ids.creator,number:1,openingMessageId:id(9),channelBaseName:'ticket-1',priority:'HIGH'}});
 const members = new D.Collection(Object.entries(ids).filter(([key])=>['creator','staff','admin','other','bot'].includes(key)).map(([key,id])=>[id,{id,user:{id,bot:key==='bot',tag:key},displayName:key,permissions:{has:()=>key==='admin'},roles:{cache:new D.Collection(key==='staff'||key==='creator'?[[ids.role,{}]]:[])}}]));
 const guild = {id:guildId,iconURL:()=>null,members:{cache:members,me:members.get(ids.bot),fetch:async id=>members.get(id)},roles:{everyone:{id:guildId}}};
 const messages = new D.Collection(), overwrites = new D.Collection();
 const overwrite = (id,type,allow,deny=[]) => overwrites.set(id,{id,type,allow:new D.PermissionsBitField(allow),deny:new D.PermissionsBitField(deny)});
 overwrite(guildId,0,[],['ViewChannel']); overwrite(ids.creator,1,['ViewChannel','SendMessages']);
 overwrite(ids.other,1,['ViewChannel','SendMessages']); overwrite(ids.role,0,['ViewChannel','SendMessages']);
 overwrite(ids.staff,1,['ViewChannel','SendMessages']); overwrite(ids.bot,1,['ViewChannel','SendMessages']);
 const events=[], logs=[];
 const channel = {id:ticket.id,guildId,guild,name:'🔴🛠️ticket-1',deletable:true,deletions:0,sent:0,
  permissionOverwrites:{cache:overwrites,edit:async(id,flags)=>{events.push('lock');if(channel.failLock)throw Object.assign(new Error('Permission'),{code:50013});const old=overwrites.get(id)||{id,type:1,allow:new D.PermissionsBitField(),deny:new D.PermissionsBitField()};for(const [name,on]of Object.entries(flags)){old[on?'allow':'deny'].add(name);old[on?'deny':'allow'].remove(name)}overwrites.set(id,old)}},
  messages:{cache:messages,fetch:async query=>{if(typeof query!=='string')return messages;const found=messages.get(query);if(!found)throw Object.assign(new Error('Unknown message'),{code:10008});return found},fetchPins:async()=>({items:[],hasMore:false})},
  setName:async name=>{channel.name=name},
  send:async payload=>{channel.sent++;const message={id:id(10+channel.sent),author:{id:ids.bot},embeds:payload.embeds.map(embed=>embed.toJSON()),components:payload.components,allowedMentions:payload.allowedMentions,edit:async data=>Object.assign(message,data)};messages.set(message.id,message);return message},
  delete:async()=>{events.push('delete');if(channel.failDelete)throw Object.assign(new Error('Permission'),{code:50013});channel.deletions++;channel.gone=true}
 };
 const opening={id:ticket.openingMessageId,components:[{components:[{customId:'close'}]}],edit:async data=>Object.assign(opening,data)};messages.set(opening.id,opening);
 const client={prisma:db,i18n,user:{id:ids.bot},supers:[],guilds:{cache:new D.Collection([[guildId,guild]])},channels:{cache:new D.Collection([[ticket.id,channel]]),fetch:async id=>{if(id!==ticket.id||channel.gone)throw Object.assign(new Error('Unknown channel'),{code:10003});return channel}},log:{warn:(...x)=>logs.push(x),error:(...x)=>logs.push(x),info:{tickets(){}}},keyv:{get:async()=>undefined,set:async()=>{},delete:async()=>{}}};
 guild.client=client;
 const Manager=load('src/lib/tickets/manager.js',{'../threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x,decrypt:x=>x})}}},'../ticket-presentation':{...P,syncTicket:async()=>{},requestSync(){}},'../stats':{},'./archiver':class{},'../logging':{logTicketEvent:async(_,event)=>events.push(event.action)},'../transcripts':{deliverTranscript:async()=>{}}});
 const manager=Object.create(Manager.prototype);manager.client=client;manager.$count={categories:{}};
 const read=()=>db.ticket.findUnique({where:{id:ticket.id},include:{guild:true,category:true,feedback:true}});
 manager.getTicket=read;manager.archiver={prepareClose:async()=>{events.push('capture');assert.equal(overwrites.get(ids.creator).deny.has('ViewChannel'),true);return !channel.failCapture},flush:async()=>{}};client.tickets=manager;
 t.after(async()=>{await db.driveAsset.deleteMany({where:{archiveId:ticket.id}});await db.driveArchive.deleteMany({where:{id:ticket.id}});await db.guild.delete({where:{id:guildId}});await db.user.deleteMany({where:{id:{in:[ids.creator,ids.staff,ids.admin,ids.other]}}});await db.$disconnect();const target=require('../src/lib/drive-archive').spool(ticket.id);assert.ok(target.startsWith(path.resolve('./user/drive-spool')+path.sep));await fs.promises.rm(target,{recursive:true,force:true})});
 return {db,client,manager,channel,opening,read,ids,guildId,category,events,logs};
}

test('closed ticket keeps category text, team commands and participant privacy until an explicit Delete',sqlite,async t=>{
 const f=await fixture(t);
 await f.db.category.update({where:{id:f.category.id},data:{textOverrides:{'buttons.delete.text':'Endgültig entfernen','ticket.close.retained':'Geschlossen für Nutzer; Team kann weiterarbeiten.'}}});
 await Promise.all([f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff}),f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff})]);
 const row=await f.read();assert.equal(row.open,false);assert.equal(row.channelDeletePending,false);assert.equal(row.closeChannelPending,false);assert.equal(row.closeCapturePending,false);assert.equal(row.deleted,false);
 assert.equal(f.channel.deletions,0);assert.equal(f.channel.sent,1);assert.equal(f.events.filter(x=>x==='close').length,1);assert.ok(f.events.indexOf('lock')<f.events.indexOf('capture'));assert.deepEqual(f.opening.components,[]);
 for(const id of [f.ids.creator,f.ids.other])assert.equal(f.channel.permissionOverwrites.cache.get(id).deny.has(['ViewChannel','SendMessages']),true);
 for(const id of [f.ids.staff,f.ids.role,f.ids.bot])assert.equal(f.channel.permissionOverwrites.cache.get(id).allow.has(['ViewChannel','SendMessages']),true);
 const control=f.channel.messages.cache.get(row.closedControlMessageId);assert.equal(control.components[0].components[0].data.label,'Endgültig entfernen');assert.deepEqual(control.allowedMentions,{parse:[]});
 await close.finishPendingCloseChannels({...f.client});assert.equal(f.channel.deletions,0);assert.equal(f.channel.sent,1);
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'rename',value:'fertig'});
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'priority',value:'LOW'});
 assert.equal((await f.read()).channelBaseName,'fertig');assert.equal((await f.read()).priority,'LOW');
 await assert.rejects(actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'transfer',value:f.ids.other}),e=>e.supportKey==='ticket.support.errors.closed');
});

test('Close by staff is immediate, while creator feedback/confirmation and stale buttons are safe',sqlite,async t=>{
 const f=await fixture(t), replies=[];
 const interaction={channel:{id:f.ids.ticket},guild:f.client.guilds.cache.get(f.guildId),guildId:f.guildId,user:{id:f.ids.staff},deferReply:async()=>{},editReply:async data=>replies.push(data),reply:async data=>replies.push(data)};
 await f.manager.beforeRequestClose(interaction);assert.equal((await f.read()).open,false);assert.equal(f.channel.deletions,0);
 await f.manager.beforeRequestClose({...interaction,user:{id:f.ids.creator}});assert.match(replies.at(-1).content,/bereits geschlossen/);assert.equal(replies.at(-1).flags,D.MessageFlags.Ephemeral);
});

test('close lock/capture failures retry after restart, without requesting deletion',sqlite,async t=>{
 const f=await fixture(t);f.channel.failLock=true;await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 let row=await f.read();assert.equal(row.closeChannelPending,true);assert.equal(row.channelDeletePending,false);assert.equal(row.closeCapturePending,true);assert.equal(row.channelDeleteAttempts,1);assert.equal(f.channel.sent,0);
 f.channel.failLock=false;f.channel.failCapture=true;await f.db.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:null}});await close.finishPendingCloseChannels({...f.client});
 assert.equal((await f.read()).closeCapturePending,true);assert.equal(f.channel.deletions,0);
 f.channel.failCapture=false;await f.db.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:null}});await close.finishPendingCloseChannels({...f.client});
 row=await f.read();assert.equal(row.closeChannelPending,false);assert.equal(row.closeCapturePending,false);assert.equal(row.channelDeletePending,false);assert.equal(f.channel.sent,1);assert.equal(f.channel.deletions,0);
});

test('Delete requires closed state, same server and category staff; concurrent requests delete only once',sqlite,async t=>{
 const f=await fixture(t), request=(actorId=f.ids.staff,guildId=f.guildId)=>close.requestDelete(f.client,{actorId,guildId,ticketId:f.ids.ticket});
 await assert.rejects(request(),e=>e.deleteCode==='open');await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 // The creator holds a support role, and still counts as a user for visibility.
 await assert.rejects(request(f.ids.other),e=>e.deleteCode==='forbidden');await assert.rejects(request(f.ids.admin,'another'),e=>e.deleteCode==='missing');
 await Promise.all([request(),request()]);await Promise.all([close.finishCloseChannel(f.client,f.ids.ticket),close.finishCloseChannel(f.client,f.ids.ticket)]);
 assert.equal(f.channel.deletions,1);assert.equal((await f.read()).deleted,true);assert.equal((await f.read()).channelDeletePending,false);
 await assert.rejects(request(),e=>e.deleteCode==='deleted');
});

test('Delete waits for durable local files over a restart, but does not wait for Drive uploads',sqlite,async t=>{
 const f=await fixture(t);await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const spool=require('../src/lib/drive-archive').spool;
 await f.db.driveArchive.create({data:{id:f.ids.ticket,guildId:f.guildId,number:1,rootFolderId:'private-test-root',state:'collecting',closedAt:new Date(),expiresAt:new Date(Date.now()+86400000)}});
 await f.db.driveAsset.create({data:{id:'file-'+f.ids.ticket,archiveId:f.ids.ticket,assetKey:'attachment:123',messageId:'123',relativePath:'files/image.png',fileName:'image.png',mime:'image/png',sourceUrl:'encrypted-url',state:'pending',localReady:false}});
 await close.requestDelete(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.admin});await close.finishCloseChannel(f.client,f.ids.ticket);assert.equal(f.channel.deletions,0);assert.equal((await f.read()).channelDeletePending,true);
 const restarted=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});restarted.$use(require('../src/lib/middleware/prisma-sqlite'));t.after(()=>restarted.$disconnect());
 await fs.promises.mkdir(path.dirname(spool(f.ids.ticket,'files/image.png')),{recursive:true});await fs.promises.writeFile(spool(f.ids.ticket,'files/image.png'),'secured');
 await restarted.driveAsset.update({where:{id:'file-'+f.ids.ticket},data:{localReady:true}});await restarted.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:null}});
 await close.finishPendingCloseChannels({...f.client,prisma:restarted});assert.equal(f.channel.deletions,1);assert.equal((await f.read()).deleted,true);assert.equal((await restarted.driveAsset.findUnique({where:{id:'file-'+f.ids.ticket}})).state,'pending');
});

test('failed Discord Delete retries durably; manually removed channels recover without recreation',sqlite,async t=>{
 const f=await fixture(t);await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});f.channel.failDelete=true;
 await close.requestDelete(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff});await close.finishCloseChannel(f.client,f.ids.ticket);
 assert.equal((await f.read()).channelDeletePending,true);assert.ok(+(await f.read()).channelDeleteNextAttemptAt>Date.now());assert.equal(f.channel.deletions,0);
 f.channel.failDelete=false;await f.db.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:null}});await close.finishPendingCloseChannels({...f.client});assert.equal(f.channel.deletions,1);
 await f.db.ticket.update({where:{id:f.ids.ticket},data:{closeChannelPending:true}});f.client.channels.cache.clear();await close.finishPendingCloseChannels({...f.client});assert.equal((await f.read()).closeChannelPending,false);assert.equal(f.channel.sent,1);
});

test('closed staff workspace messages cannot rewrite the archived conversation; new labels inherit and validate',sqlite,async t=>{
 const f=await fixture(t);await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const Archiver=load('src/lib/tickets/archiver.js',{'../threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x,decrypt:x=>x})}}}});
 assert.equal(await new Archiver(f.client).saveMessage(f.ids.ticket,{id:'later',createdAt:new Date(Date.now()+1000)}),true);assert.equal(await f.db.archivedMessage.count({where:{ticketId:f.ids.ticket}}),0);
 const keys=new Set(getCatalog(i18n,'de').map(x=>x.key));for(const key of ['buttons.delete.text','ticket.close.retained','ticket.delete.queued'])assert.ok(keys.has(key));
 assert.throws(()=>validateOverrides(i18n,'de',{'buttons.delete.text':'x'.repeat(81)}));
 await f.db.guild.update({where:{id:f.guildId},data:{textOverrides:{'buttons.delete.text':'Server Delete'}}});assert.equal((await getSupportMessages(f.client,{ticketId:f.ids.ticket}))('buttons.delete.text'),'Server Delete');
 await f.db.category.update({where:{id:f.category.id},data:{textOverrides:{'buttons.delete.text':'Category Delete'}}});assert.equal((await getSupportMessages(f.client,{ticketId:f.ids.ticket}))('buttons.delete.text'),'Category Delete');
 await f.db.category.update({where:{id:f.category.id},data:{textOverrides:{}}});await f.db.guild.update({where:{id:f.guildId},data:{locale:'en-GB',textOverrides:{}}});assert.equal((await getSupportMessages(f.client,{ticketId:f.ids.ticket}))('buttons.delete.text'),'Delete');
});

test('migration converts legacy automatic deletion into a retained closure on all providers',sqlite,async t=>{
 const f=await fixture(t);await f.db.ticket.update({where:{id:f.ids.ticket},data:{open:false,channelDeletePending:true,closeCapturePending:true,channelDeleteNextAttemptAt:new Date(Date.now()+60000)}});
 const sql=fs.readFileSync(path.join(__dirname,'../db/sqlite/migrations/20261006120000_two_stage_closure/migration.sql'),'utf8');await f.db.$executeRawUnsafe(sql.slice(sql.indexOf('UPDATE')));
 assert.equal((await f.read()).channelDeletePending,false);assert.equal((await f.read()).closeChannelPending,true);assert.equal((await f.read()).channelDeleteNextAttemptAt,null);
 for(const provider of ['sqlite','mysql','postgresql']){const migration=fs.readFileSync(path.join(__dirname,'../db/'+provider+'/migrations/20261006120000_two_stage_closure/migration.sql'),'utf8');assert.match(migration,/UPDATE/);assert.match(migration,/closedControlMessageId/);assert.match(migration,/closeChannelPending/)}
});

test('Delete interaction is private, refuses unrelated users and preserves its durable action',sqlite,async t=>{
 const f=await fixture(t);await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const {runDelete}=require('../src/lib/ticket-delete'), replies=[];
 const interaction={channelId:f.ids.ticket,guildId:f.guildId,user:{id:f.ids.other},deferReply:async data=>assert.equal(data.flags,D.MessageFlags.Ephemeral),editReply:async data=>replies.push(data)};
 await runDelete(f.client,interaction);assert.equal((await f.read()).channelDeletePending,false);assert.match(replies.at(-1).content,/Nur zuständige Supporter/);
 await runDelete(f.client,{...interaction,user:{id:f.ids.staff}});assert.match(replies.at(-1).content,/vorgemerkt/);assert.deepEqual(replies.at(-1).allowedMentions,{parse:[]});assert.equal(f.channel.deletions,1);
});

test('archiving disabled keeps only Delete and does not block explicit deletion',sqlite,async t=>{
 const f=await fixture(t);await f.db.guild.update({where:{id:f.guildId},data:{archive:false}});await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const row=await f.read(),control=f.channel.messages.cache.get(row.closedControlMessageId);assert.equal(control.components[0].components.length,1);assert.match(control.embeds[0].description,/deaktiviert/);assert.equal(f.events.includes('capture'),false);assert.equal(row.transcriptPending,false);
 await close.requestDelete(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff});await close.finishCloseChannel(f.client,f.ids.ticket);assert.equal(f.channel.deletions,1);
});

test('participant commands racing with Close cannot restore user visibility or report a false success',sqlite,async t=>{
 for(const action of ['add','remove']){
  const f=await fixture(t), replies=[];
  f.client.channels.fetch=async()=>{await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});return f.channel};
  f.client.guilds.cache.get(f.guildId).channels={fetch:f.client.channels.fetch};
  const Command=load('src/commands/slash/'+action+'.js'), command=Object.create(Command.prototype);command.client=f.client;
  const interaction={guild:f.client.guilds.cache.get(f.guildId),guildId:f.guildId,channel:{id:f.ids.ticket},channelId:f.ids.ticket,user:{id:f.ids.staff},member:{id:f.ids.staff},options:{getString:()=>null,getMember:()=>interaction.guild.members.cache.get(f.ids.other)},deferReply:async()=>{},editReply:async data=>replies.push(data)};
  await command.run(interaction);assert.match(replies.at(-1).content,/bereits geschlossen/);assert.equal(f.channel.permissionOverwrites.cache.get(f.ids.other).deny.has('ViewChannel'),true);
 }
});

test('close controls and transcript use separate author-wide nonces and restart recovery preserves the correct message',sqlite,async t=>{
 const f=await fixture(t), transcriptId=String(BigInt(f.guildId)+30n), nonces=new Map(), sent=[];
 await f.db.guild.update({where:{id:f.guildId},data:{transcriptChannel:transcriptId}});
 f.client.config={templates:{}};
 const send=f.channel.send;
 f.channel.send=async payload=>{
  if(payload.enforceNonce&&nonces.has(payload.nonce))return nonces.get(payload.nonce);
  const message=await send(payload);nonces.set(payload.nonce,message);return message;
 };
 const transcriptChannel={id:transcriptId,guildId:f.guildId,type:D.ChannelType.GuildText,guild:{members:{me:{}}},permissionsFor:()=>({has:()=>true}),
  messages:{fetch:async()=>new D.Collection(sent.map(msg=>[msg.id,msg]))},
  send:async payload=>{
   if(payload.enforceNonce&&nonces.has(payload.nonce))return nonces.get(payload.nonce);
   const message={id:String(BigInt(transcriptId)+1n),channelId:transcriptId,payload,author:{id:f.ids.bot},attachments:new D.Collection([['html',{}]]),embeds:payload.embeds.map(embed=>embed.toJSON())};
   nonces.set(payload.nonce,message);sent.push(message);return message;
  }
 };
 const fetch=f.client.channels.fetch;
 f.client.channels.fetch=async id=>id===transcriptId?transcriptChannel:fetch(id);
 const transcripts=load('src/lib/transcripts.js',{'./threads':{pools:{transcript:{queue:async callback=>callback(ticket=>ticket)},crypto:{queue:async callback=>callback({decrypt:value=>value})}}}});
 await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const controls=(await f.read()).closedControlMessageId;
 await transcripts.deliverTranscript(f.client,f.ids.ticket);
 const row=await f.read();assert.equal(sent.length,1);assert.notEqual(row.transcriptMessageId,controls);assert.equal(row.transcriptMessageId,sent[0].id);assert.equal(sent[0].payload.files[0].name,'ticket-1.html');
 assert.equal(nonces.size,2);for(const nonce of nonces.keys())assert.ok(nonce.length<=25);
 assert.equal(f.channel.sent,1);assert.equal(f.channel.deletions,0);
 await f.db.ticket.update({where:{id:f.ids.ticket},data:{transcriptPending:true,transcriptMessageId:null,transcriptNextAttemptAt:null}});
 await transcripts.deliverPendingTranscripts({...f.client});
 assert.equal(sent.length,1);assert.equal((await f.read()).transcriptMessageId,sent[0].id);
});
