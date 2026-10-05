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
 const channel = {id:ticket.id,guildId,guild,name:'🔴🛠️ticket-1',parentId:category.discordCategory,deletable:true,deletions:0,sent:0,placements:[],
  permissionOverwrites:{cache:overwrites,edit:async(id,flags)=>{events.push('lock');if(channel.failLock)throw Object.assign(new Error('Permission'),{code:50013});const old=overwrites.get(id)||{id,type:1,allow:new D.PermissionsBitField(),deny:new D.PermissionsBitField()};for(const [name,on]of Object.entries(flags)){old[on?'allow':'deny'].add(name);old[on?'deny':'allow'].remove(name)}overwrites.set(id,old)}},
  messages:{cache:messages,delete:async id=>messages.delete(id),fetch:async query=>{if(typeof query!=='string')return messages;const found=messages.get(query);if(!found)throw Object.assign(new Error('Unknown message'),{code:10008});return found},fetchPins:async()=>({items:[],hasMore:false})},
  setName:async name=>{channel.name=name},
  edit:async data=>{events.push('place');channel.placements.push(data);assert.ok(overwrites.get(ids.creator).deny.has(['ViewChannel','SendMessages']));assert.equal(data.permissionOverwrites,undefined);if(data.parent)assert.equal(data.lockPermissions,false);if(channel.failPlacement)throw Object.assign(new Error('Placement unavailable'),{code:channel.failPlacement});if(data.name!==undefined)channel.name=data.name;if(data.parent!==undefined)channel.parentId=data.parent;return channel},
  send:async payload=>{channel.sent++;const message={id:id(10+channel.sent),author:{id:ids.bot},embeds:(payload.embeds||[]).map(embed=>embed.toJSON()),components:payload.components,allowedMentions:payload.allowedMentions,edit:async data=>Object.assign(message,data),delete:async()=>messages.delete(message.id)};messages.set(message.id,message);return message},
  delete:async()=>{events.push('delete');if(channel.failDelete)throw Object.assign(new Error('Permission'),{code:50013});channel.deletions++;channel.gone=true}
 };
 const opening={id:ticket.openingMessageId,components:[{components:[{customId:'close'}]}],edit:async data=>Object.assign(opening,data)};messages.set(opening.id,opening);
 const channels=new D.Collection([[ticket.id,channel]]);
 const client={prisma:db,i18n,user:{id:ids.bot},supers:[],guilds:{cache:new D.Collection([[guildId,guild]])},channels:{cache:channels,fetch:async id=>{if(!channels.has(id)||channels.get(id).gone)throw Object.assign(new Error('Unknown channel'),{code:10003});return channels.get(id)}},log:{warn:(...x)=>logs.push(x),error:(...x)=>logs.push(x),info:{tickets(){}}},keyv:{get:async()=>undefined,set:async()=>{},delete:async()=>{}}};
 guild.client=client;
 t.after(()=>P.stopPresentations(client));
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
 assert.equal(f.channel.name,'closed-1');assert.equal(f.channel.parentId,f.category.discordCategory);assert.equal(row.priority,'HIGH');
 for(const id of [f.ids.creator,f.ids.other])assert.equal(f.channel.permissionOverwrites.cache.get(id).deny.has(['ViewChannel','SendMessages']),true);
 for(const id of [f.ids.staff,f.ids.role,f.ids.bot])assert.equal(f.channel.permissionOverwrites.cache.get(id).allow.has(['ViewChannel','SendMessages']),true);
 const control=f.channel.messages.cache.get(row.closedControlMessageId);assert.equal(control.components[0].components[0].data.label,'Endgültig entfernen');assert.deepEqual(control.allowedMentions,{parse:[]});
 await close.finishPendingCloseChannels({...f.client});assert.equal(f.channel.deletions,0);assert.equal(f.channel.sent,1);
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'rename',value:'fertig'});
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'priority',value:'LOW'});
 assert.equal((await f.read()).channelBaseName,'fertig');assert.equal((await f.read()).priority,'LOW');
 await assert.rejects(actions.performAction(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.staff,action:'transfer',value:f.ids.other}),e=>e.supportKey==='ticket.support.errors.closed');
});

test('Close by staff requests creator confirmation before retaining the closed channel for Delete',sqlite,async t=>{
 const f=await fixture(t), replies=[];
 const interaction={channel:{id:f.ids.ticket},guild:f.client.guilds.cache.get(f.guildId),guildId:f.guildId,user:{id:f.ids.staff},member:{displayName:'Staff'},deferReply:async()=>{},editReply:async data=>{replies.push(data);return f.channel.send(data)},reply:async data=>replies.push(data)};
 await f.manager.beforeRequestClose(interaction);assert.equal((await f.read()).open,true);assert.equal(f.channel.deletions,0);
 const requestId=(await f.read()).closeRequestMessageId;
 await f.manager.acceptClose({...interaction,user:{id:f.ids.creator}},requestId);assert.equal((await f.read()).open,false);assert.equal(f.channel.deletions,0);
 await f.manager.beforeRequestClose({...interaction,user:{id:f.ids.creator}});assert.match(replies.at(-1).content,/bereits geschlossen/);assert.equal(replies.at(-1).flags,D.MessageFlags.Ephemeral);
});

function interaction(f, actor=f.ids.staff, message=null) {
 const replies=[], guild=f.client.guilds.cache.get(f.guildId); let reply;
 return { channel:f.channel,guild,guildId:f.guildId,user:{id:actor,toString:()=>`<@${actor}>`},member:guild.members.cache.get(actor),message,createdAt:new Date(),replies,
  deferReply:async()=>{},reply:async data=>replies.push(data),update:async data=>message.edit(data),
  editReply:async data=>{replies.push(data);if(!reply)reply=await f.channel.send(data);else await reply.edit(data);return reply},
  showModal:async modal=>replies.push(modal),followUp:async()=>{}
 };
}

function closedCategory(f, offset=50) {
 const id=String(BigInt(f.guildId)+BigInt(offset)),guild=f.client.guilds.cache.get(f.guildId);
 const category={id,guildId:f.guildId,guild,name:'Closed',type:D.ChannelType.GuildCategory,permissionsFor:()=>new D.PermissionsBitField(['ViewChannel','ManageChannels']),permissionOverwrites:{cache:new D.Collection([[f.guildId,{id:f.guildId,allow:new D.PermissionsBitField('ViewChannel')}]])}};
 f.client.channels.cache.set(id,category);return category;
}

test('manual, confirmed and automatic closures move into the selected Discord category and retain ticket identity and private staff access',sqlite,async t=>{
 for(const kind of ['manual','confirmed','automatic']) {
  const f=await fixture(t),target=closedCategory(f);await f.db.guild.update({where:{id:f.guildId},data:{closedTicketCategory:target.id}});
  const request=interaction(f,f.ids.admin);await f.manager.beforeRequestClose(request);
  let row=await f.read();assert.equal(row.open,true);assert.equal(f.channel.parentId,f.category.discordCategory);assert.equal(f.channel.name,'🔴🛠️ticket-1');assert.equal(f.channel.placements.length,0);
  if(kind==='confirmed')await f.manager.acceptClose(interaction(f,f.ids.creator),row.closeRequestMessageId);
  else if(kind==='automatic'){const deadline=new Date(Date.now()-1);await f.db.ticket.update({where:{id:f.ids.ticket},data:{closeScheduledAt:deadline}});await f.manager.finallyClose(f.ids.ticket,{expectedCloseAt:deadline});}
  else await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.admin});
  row=await f.read();assert.equal(row.open,false);assert.equal(row.closeChannelPending,false);assert.equal(row.categoryId,f.category.id);assert.equal(row.priority,'HIGH');assert.equal(row.channelBaseName,'ticket-1');
  assert.equal(f.channel.name,'closed-1');assert.equal(f.channel.parentId,target.id);assert.equal(f.channel.placements.length,1);assert.equal(f.channel.placements[0].lockPermissions,false);assert.equal(f.channel.deletions,0);
  assert.equal(f.channel.permissionOverwrites.cache.get(f.guildId).deny.has('ViewChannel'),true);assert.equal(f.channel.permissionOverwrites.cache.get(f.ids.creator).deny.has('ViewChannel'),true);
  for(const id of [f.ids.staff,f.ids.role,f.ids.bot])assert.equal(f.channel.permissionOverwrites.cache.get(id).allow.has(['ViewChannel','SendMessages']),true);
  assert.equal(target.permissionOverwrites.cache.get(f.guildId).allow.has('ViewChannel'),true);
  const sent=f.channel.sent;await close.finishPendingCloseChannels({...f.client});assert.equal(f.channel.placements.length,1);assert.equal(f.channel.sent,sent);
 }
});

test('category/name API failures persist retries at 1, 5 and 15 minutes and recover after restart with current settings',sqlite,async t=>{
 const f=await fixture(t),first=closedCategory(f),second=closedCategory(f,51);await f.db.guild.update({where:{id:f.guildId},data:{closedTicketCategory:first.id}});
 f.channel.failPlacement=50013;await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.admin});
 for(const [index,delay] of [60000,300000,900000].entries()) {
  const row=await f.read();assert.equal(row.channelDeleteAttempts,index+1);assert.equal(row.closeChannelPending,true);assert.equal(row.closeCapturePending,false);assert.equal(row.channelDeletePending,false);assert.ok(+row.channelDeleteNextAttemptAt-Date.now()>=delay-3000);
  assert.equal(f.channel.sent,1);assert.equal(f.events.filter(event=>event==='capture').length,1);assert.equal(f.channel.name,'🔴🛠️ticket-1');assert.equal(f.channel.permissionOverwrites.cache.get(f.ids.creator).deny.has('ViewChannel'),true);
  if(index<2){await f.db.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:new Date(Date.now()-1)}});await close.finishPendingCloseChannels({...f.client});}
 }
 const db=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});db.$use(require('../src/lib/middleware/prisma-sqlite'));t.after(()=>db.$disconnect());
 await db.guild.update({where:{id:f.guildId},data:{closedTicketCategory:second.id}});await db.ticket.update({where:{id:f.ids.ticket},data:{channelDeleteNextAttemptAt:new Date(Date.now()-1)}});f.channel.failPlacement=false;
 await close.finishPendingCloseChannels({...f.client,prisma:db});
 const row=await f.read();assert.equal(row.closeChannelPending,false);assert.equal(row.channelDeleteNextAttemptAt,null);assert.equal(row.channelDeleteAttempts,0);assert.equal(f.channel.parentId,second.id);assert.equal(f.channel.name,'closed-1');assert.equal(f.channel.sent,1);assert.equal(f.channel.deletions,0);
});

test('a removed closed category leaves closure durable and private, while explicit Delete can still finish',sqlite,async t=>{
 const f=await fixture(t),target=closedCategory(f);await f.db.guild.update({where:{id:f.guildId},data:{closedTicketCategory:target.id}});f.client.channels.cache.delete(target.id);
 await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});const row=await f.read();assert.equal(row.open,false);assert.equal(row.closeChannelPending,true);assert.equal(row.closeCapturePending,false);assert.equal(f.channel.sent,1);
 assert.equal(f.channel.parentId,f.category.discordCategory);assert.equal(f.channel.permissionOverwrites.cache.get(f.ids.creator).deny.has('ViewChannel'),true);
 await close.requestDelete(f.client,{guildId:f.guildId,ticketId:f.ids.ticket,actorId:f.ids.admin});await close.finishCloseChannel(f.client,f.ids.ticket);
 assert.equal((await f.read()).deleted,true);assert.equal(f.channel.deletions,1);
});

test('normal Close from the opening button and slash command waits for the creator even for administrators and bot owners',sqlite,async t=>{
 for(const entry of ['button','command','owner']) {
  const f=await fixture(t),actor=entry==='owner'?f.ids.other:f.ids.admin;if(entry==='owner')f.client.supers=[actor];
  const value=interaction(f,actor),file=entry==='command'?'src/commands/slash/close.js':'src/buttons/close.js',Handler=load(file),handler=Object.create(Handler.prototype);handler.client=f.client;
  if(entry==='command')await handler.run(value);else await handler.run({action:'close'},value);
  let row=await f.read();assert.equal(row.open,true);assert.equal(row.closeRequestedById,actor);assert.ok(row.closeScheduledAt>new Date());assert.equal(f.events.includes('lock'),false);assert.equal(f.channel.placements.length,0);
  await f.manager.acceptClose(interaction(f,actor),row.closeRequestMessageId);assert.equal((await f.read()).open,true);
  await f.manager.acceptClose(interaction(f,f.ids.creator),row.closeRequestMessageId);row=await f.read();assert.equal(row.open,false);assert.equal(f.channel.name,'closed-1');
 }
});

test('temporary member fetch errors never bypass user confirmation, while a confirmed server departure still closes',sqlite,async t=>{
 for(const code of ['ETIMEDOUT',50013,10007]) {
  const f=await fixture(t),guild=f.client.guilds.cache.get(f.guildId);guild.members.fetch=async()=>{throw Object.assign(new Error('Member fetch failed'),{code})};
  await f.manager.beforeRequestClose(interaction(f,f.ids.admin));const row=await f.read();
  if(code===10007){assert.equal(row.open,false);assert.equal(row.closedById,f.ids.admin);assert.equal(f.channel.name,'closed-1');}
  else{assert.equal(row.open,true);assert.equal(row.closeRequestedById,f.ids.admin);assert.ok(row.closeRequestMessageId);assert.equal(f.events.includes('lock'),false);assert.equal(f.channel.placements.length,0);}
 }
});

test('user request, continued conversation and a fresh team request require a new creator confirmation',sqlite,async t=>{
 const f=await fixture(t);
 await f.manager.beforeRequestClose(interaction(f,f.ids.creator));
 const old=await f.read(), oldMessage=f.channel.messages.cache.get(old.closeRequestMessageId);
 assert.equal(JSON.parse(oldMessage.components[0].components[0].data.custom_id).expect,'staff');
 await actions.claimOnReply(f.client,{guildId:f.guildId,channelId:f.ids.ticket,author:{id:f.ids.staff,bot:false},content:'I can still help.'});
 await P.recordParticipant(f.client,f.ids.ticket,f.ids.staff,new Date(),null,false);
 let row=await f.read();assert.equal(row.open,true);assert.equal(row.closeRequestedAt,null);assert.equal(row.closeScheduledAt,null);assert.equal(row.closeRequestMessageId,null);
 assert.equal(f.channel.messages.cache.has(old.closeRequestMessageId),false);
 await f.manager.beforeRequestClose(interaction(f));row=await f.read();
 assert.equal(row.open,true);assert.equal(row.claimedById,f.ids.staff);assert.equal(row.closeRequestedById,f.ids.staff);assert.equal(row.priority,'HIGH');
 assert.notEqual(row.closeRequestMessageId,old.closeRequestMessageId);assert.ok(+row.closeRequestedAt>+old.closeRequestedAt);assert.equal(+row.closeScheduledAt-+row.closeRequestedAt,43200000);
 const Close=load('src/buttons/close.js'),button=Object.create(Close.prototype);button.client=f.client;
 const stale=interaction(f,f.ids.staff,oldMessage);await button.run({accepted:true,expect:'staff'},stale);
 assert.match(stale.replies[0].content,/nicht mehr aktiv/);assert.equal((await f.read()).open,true);
 const current=f.channel.messages.cache.get(row.closeRequestMessageId);assert.equal(JSON.parse(current.components[0].components[0].data.custom_id).expect,'user');
 await button.run({accepted:true,expect:'user'},interaction(f,f.ids.creator,current));
 assert.equal((await f.read()).open,false);assert.equal((await f.read()).closedById,f.ids.staff);assert.equal(f.channel.deletions,0);
});

test('expired accept/reject controls and stale feedback cannot close or cancel a newer request',sqlite,async t=>{
 const f=await fixture(t);await f.db.category.update({where:{id:f.category.id},data:{enableFeedback:true}});
 await f.manager.beforeRequestClose(interaction(f));
 const old=await f.read(),oldMessage=f.channel.messages.cache.get(old.closeRequestMessageId);
 const Close=load('src/buttons/close.js'),button=Object.create(Close.prototype);button.client=f.client;
 const openModal=interaction(f,f.ids.creator,oldMessage);await button.run({accepted:true,expect:'user'},openModal);
 const modalId=JSON.parse(openModal.replies[0].toJSON().custom_id);assert.equal(modalId.request,old.closeRequestMessageId);assert.ok(openModal.replies[0].toJSON().custom_id.length<=100);
 await P.recordParticipant(f.client,f.ids.ticket,f.ids.creator,new Date(),null,false);
 await f.manager.beforeRequestClose(interaction(f));const fresh=await f.read();
 for(const accepted of [true,false]){const stale=interaction(f,f.ids.creator,oldMessage);await button.run({accepted,expect:'user'},stale);assert.match(stale.replies[0].content,/nicht mehr aktiv/);}
 const Feedback=load('src/modals/feedback.js',{'../lib/threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x})}}}}),feedback=Object.create(Feedback.prototype);feedback.client=f.client;
 const staleModal=interaction(f,f.ids.creator);staleModal.fields={getTextInputValue:()=>assert.fail('Expired feedback must be refused before saving')};
 await feedback.run(modalId,staleModal);assert.match(staleModal.replies[0].content,/nicht mehr aktiv/);
 assert.equal((await f.read()).open,true);assert.equal((await f.read()).closeRequestMessageId,fresh.closeRequestMessageId);assert.equal((await f.read()).feedback,null);
});

test('current feedback retains the request ID, saves the rating and confirms only that request',sqlite,async t=>{
 const f=await fixture(t);await f.db.category.update({where:{id:f.category.id},data:{enableFeedback:true}});
 await f.manager.beforeRequestClose(interaction(f));const row=await f.read();
 const Close=load('src/buttons/close.js'),button=Object.create(Close.prototype);button.client=f.client;
 const confirm=interaction(f,f.ids.creator,f.channel.messages.cache.get(row.closeRequestMessageId));
 await button.run({accepted:true,expect:'user'},confirm);const id=JSON.parse(confirm.replies[0].toJSON().custom_id);
 const Feedback=load('src/modals/feedback.js',{'../lib/threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x})}}}}),modal=Object.create(Feedback.prototype);modal.client=f.client;
 const submit=interaction(f,f.ids.creator);submit.fields={getTextInputValue:key=>key==='rating'?'5':'Solved'};
 await modal.run(id,submit);const closed=await f.read();assert.equal(closed.open,false);assert.equal(closed.feedback.rating,5);assert.equal(closed.feedback.comment,'Solved');assert.equal(f.channel.deletions,0);assert.equal(f.events.filter(event=>event==='close').length,1);assert.equal(submit.replies.some(reply=>/nicht mehr aktiv/.test(reply.content||'')),false);
});

test('a message during the confirmation delay cancels closing; a new request also survives an old confirmation',sqlite,async t=>{
 for(const renew of [false,true]){
  const f=await fixture(t);await f.manager.beforeRequestClose(interaction(f));const old=await f.read(),read=f.manager.getTicket;let reads=0;
  f.manager.getTicket=async()=>{if(++reads===2){await P.recordParticipant(f.client,f.ids.ticket,f.ids.creator,new Date(),null,false);if(renew)await f.manager.beforeRequestClose(interaction(f));}return read()};
  const confirm=interaction(f,f.ids.creator);await f.manager.acceptClose(confirm,old.closeRequestMessageId);
  const row=await f.read();assert.equal(row.open,true);assert.equal(row.closeChannelPending,false);assert.equal(f.channel.permissionOverwrites.cache.get(f.ids.creator).allow.has('ViewChannel'),true);
  assert.match(confirm.replies.at(-1).content,/nicht mehr aktiv/);
  if(renew)assert.notEqual(row.closeRequestMessageId,old.closeRequestMessageId);else assert.equal(row.closeRequestMessageId,null);
 }
});

test('rejecting an old request while the Discord update is pending cannot cancel the newly created request',sqlite,async t=>{
 const f=await fixture(t);await f.manager.beforeRequestClose(interaction(f));const old=await f.read();
 const Close=load('src/buttons/close.js'),button=Object.create(Close.prototype);button.client=f.client;
 const reject=interaction(f,f.ids.creator,f.channel.messages.cache.get(old.closeRequestMessageId));
 reject.update=async()=>{await P.recordParticipant(f.client,f.ids.ticket,f.ids.creator,new Date(),null,false);await f.manager.beforeRequestClose(interaction(f));};
 await button.run({accepted:false,expect:'user'},reject);
 const row=await f.read();assert.equal(row.open,true);assert.notEqual(row.closeRequestMessageId,old.closeRequestMessageId);assert.ok(row.closeRequestedAt);
});

test('request confirmation is refused for the requester, unrelated staff, the wrong server and missing request IDs',sqlite,async t=>{
 const f=await fixture(t);await f.manager.beforeRequestClose(interaction(f,f.ids.creator));const row=await f.read();
 for(const [actor,guildId,requestId]of [[f.ids.creator,f.guildId,row.closeRequestMessageId],[f.ids.other,f.guildId,row.closeRequestMessageId],[f.ids.staff,'another',row.closeRequestMessageId],[f.ids.staff,f.guildId,null]]){
  const confirm={...interaction(f,actor),guildId};await f.manager.acceptClose(confirm,requestId);assert.equal((await f.read()).open,true);assert.ok(confirm.replies[0].content);
 }
});

test('an atomic confirmed close cannot win after a newer request replaces its database snapshot',sqlite,async t=>{
 const f=await fixture(t);await f.manager.beforeRequestClose(interaction(f));const old=await f.read();let replaced=false;
 const ticketDb=new Proxy(f.db.ticket,{get(target,key){if(key!=='updateMany')return Reflect.get(target,key);return async args=>{
  if(args.data.open===false&&!replaced){replaced=true;await target.update({where:{id:f.ids.ticket},data:{closeRequestMessageId:'new-request',closeRequestedAt:new Date()}})}
  return target.updateMany(args);
 }}});
 f.client.prisma=new Proxy(f.db,{get:(target,key)=>key==='ticket'?ticketDb:Reflect.get(target,key)});
 const confirm=interaction(f,f.ids.creator);await f.manager.acceptClose(confirm,old.closeRequestMessageId);
 assert.equal(replaced,true);assert.equal((await f.read()).open,true);assert.equal((await f.read()).closeRequestMessageId,'new-request');assert.equal(f.events.includes('lock'),false);
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
 const keys=new Set(getCatalog(i18n,'de').map(x=>x.key));for(const key of ['buttons.delete.text','ticket.close.retained','ticket.delete.queued','ticket.close.request_expired'])assert.ok(keys.has(key));
 assert.throws(()=>validateOverrides(i18n,'de',{'ticket.close.request_expired':'x'.repeat(2001)}));
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
 const f=await fixture(t),target=closedCategory(f);await f.db.guild.update({where:{id:f.guildId},data:{archive:false,closedTicketCategory:target.id}});await f.manager.finallyClose(f.ids.ticket,{closedBy:f.ids.staff});
 const row=await f.read(),control=f.channel.messages.cache.get(row.closedControlMessageId);assert.equal(control.components[0].components.length,1);assert.match(control.embeds[0].description,/deaktiviert/);assert.equal(f.events.includes('capture'),false);assert.equal(row.transcriptPending,false);
 assert.equal(f.channel.name,'closed-1');assert.equal(f.channel.parentId,target.id);
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
