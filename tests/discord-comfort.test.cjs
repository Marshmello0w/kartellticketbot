const test = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { PrismaClient } = require('@prisma/client');
const { fixture, load, actions, ui, presentation: P, i18n, D } = require('./helpers/comfort.cjs');
const { getSupportMessages, getCatalog, validateOverrides } = require('../src/lib/support-texts');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('waiting timer resets after every message and retains both managed prefixes', () => {
 const at = new Date(1000000), ticket = { number: 42, guild: {}, createdAt: at, priority: 'HIGH', channelBaseName: 'ticket-042' };
 assert.equal(P.waitingState(ticket, +at + P.WAIT_MS - 1), 'ACTIVE');
 assert.equal(P.channelName(ticket, +at + P.WAIT_MS), '🔴🛠️ticket-042');
 ticket.lastParticipantSide = 'STAFF'; ticket.lastParticipantAt = new Date(+at + 1000);
 assert.equal(P.channelName(ticket, +at + P.WAIT_MS), '🔴ticket-042');
 assert.equal(P.channelName(ticket, +at + P.WAIT_MS + 1000), '🔴👤ticket-042');
 ticket.lastParticipantAt = new Date(+at + 5000);
 assert.equal(P.waitingState(ticket, +at + P.WAIT_MS + 1000), 'ACTIVE');
 ticket.guild.automaticTicketStatus = false;
 assert.equal(P.channelName(ticket, +at + 1000000), '🔴ticket-042');
 assert.equal(P.stripManagedPrefix('🔴🛠️🟠👤ticket-042'), 'ticket-042');
 ticket.channelBaseName = 'x'.repeat(100);
 assert.equal(Array.from(P.channelName(ticket)).length, 100);
 ticket.priority = null; assert.equal(P.channelName(ticket), 'x'.repeat(100));
});
test('new support labels, errors and deadline placeholders are editable with Discord limits', () => {
 const keys = new Set(getCatalog(i18n,'de').map(field => field.key));
 for (const key of ['buttons.support.text','menus.support.options.handoff','ticket.support.errors.assigned','ticket.support.deadline.value','ticket.support.overview.title']) assert.ok(keys.has(key),key);
 assert.throws(() => validateOverrides(i18n,'de',{'menus.support.options.claim':'x'.repeat(101)}));
 assert.deepEqual(validateOverrides(i18n,'de',{'ticket.support.deadline.value':'Bis {absolute}\n{relative}'}),{'ticket.support.deadline.value':'Bis {absolute}\n{relative}'});
});
test('SQLite: category roles, creator precedence, same-side activity, cancellation and restart', sqlite, async t => {
 const f = await fixture(t), { ticket } = await f.create({ priority:'HIGH' });
 f.members.get(f.ids.creator).roles.cache.set(f.roles.de,{});
 assert.equal(await P.participantSide(f.client,await f.read(ticket.id),f.ids.creator),'USER');
 assert.equal(await P.participantSide(f.client,await f.read(ticket.id),f.ids.staff),'STAFF');
 assert.equal(await P.participantSide(f.client,await f.read(ticket.id),f.ids.admin),'STAFF');
 assert.equal(await P.participantSide(f.client,{...await f.read(ticket.id),category:f.en},f.ids.staff),'USER');
 const at = new Date();
 await P.recordParticipant(f.client,ticket.id,f.ids.staff,at,'100',false);
 await P.recordParticipant(f.client,ticket.id,f.ids.staff,new Date(+at+1000),'101',false);
 assert.equal(+(await f.read(ticket.id)).lastParticipantAt,+at+1000);
 await f.db.ticket.update({where:{id:ticket.id},data:{closeRequestedAt:new Date(+at+2000),closeScheduledAt:new Date(+at+43200000),closeRequestedById:f.ids.staff,closeRequestMessageId:'999'}});
 await P.recordParticipant(f.client,ticket.id,f.ids.user,new Date(+at+1500),'102',false);
 assert.ok((await f.read(ticket.id)).closeScheduledAt);
 await P.recordParticipant(f.client,ticket.id,f.ids.user,new Date(+at+3000),'103',false);
 const saved = await f.read(ticket.id); assert.equal(saved.closeScheduledAt,null); assert.equal(saved.priority,'HIGH'); assert.equal(saved.lastParticipantSide,'USER');
 const restarted = new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});
 try { const after = await restarted.ticket.findUnique({where:{id:ticket.id}}); assert.equal(after.lastParticipantSide,'USER'); assert.equal(after.lastParticipantMessageId,'103'); }
 finally { await restarted.$disconnect(); }
});
test('SQLite: overview and opening button use category text; edit once, recreate and delete independently', sqlite, async t => {
 const f = await fixture(t), de = await f.create({priority:'HIGH'}), en = await f.create({categoryId:f.en.id});
 await Promise.all([P.syncTicket(f.client,de.ticket.id),P.syncTicket(f.client,en.ticket.id)]);
 assert.equal(f.overview.sent,2); assert.equal(de.opening.components[0].components.at(-1).data.label,'Team-Aktionen'); assert.equal(en.opening.components[0].components.at(-1).data.label,'Staff actions');
 let dt = await f.read(de.ticket.id), et = await f.read(en.ticket.id);
 assert.ok(f.overview.messages.cache.get(dt.overviewMessageId).embeds[0].toJSON().fields.some(field => field.value==='Noch frei'));
 assert.ok(f.overview.messages.cache.get(et.overviewMessageId).embeds[0].toJSON().fields.some(field => field.value==='Unclaimed'));
 const edits = f.overview.edits;
 await Promise.all([P.syncTicket(f.client,de.ticket.id),P.syncTicket(f.client,de.ticket.id)]);
 assert.equal(f.overview.sent,2); assert.equal(f.overview.edits,edits);
 assert.deepEqual(f.overview.messages.cache.get(dt.overviewMessageId).allowedMentions,{parse:[]});
 await f.db.category.update({where:{id:f.de.id},data:{textOverrides:{'buttons.support.text':'Neuer Text'}}});
 await P.syncTicket(f.client,de.ticket.id); assert.equal(de.opening.components[0].components.at(-1).data.label,'Team-Aktionen');
 f.overview.messages.cache.delete(dt.overviewMessageId);
 await P.syncTicket(f.client,de.ticket.id); dt = await f.read(de.ticket.id); assert.equal(f.overview.sent,3); assert.ok(dt.overviewMessageId);
 await f.db.ticket.update({where:{id:de.ticket.id},data:{open:false,closedAt:new Date()}});
 await P.syncTicket(f.client,de.ticket.id);
 assert.equal((await f.read(de.ticket.id)).overviewMessageId,null); assert.ok(f.overview.messages.cache.has(et.overviewMessageId)); assert.equal(f.overview.messages.cache.size,1);
});
test('SQLite: close deadline in request and overview stays identical and never reduces priority', sqlite, async t => {
 const f = await fixture(t), row = await f.create({priority:'HIGH'});
 const request = row.channel.add({embeds:[new D.EmbedBuilder().setDescription('Schließen?')]});
 const Manager = load('src/lib/tickets/manager.js',{'../threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x,decrypt:x=>x})}}},'../logging':{logTicketEvent:async()=>{}},'./archiver':class{}, '../stats':{}});
 const manager = Object.create(Manager.prototype); manager.client = f.client;
 await manager.scheduleClose(await f.read(row.ticket.id),request,f.ids.staff,'done');
 const ticket = await f.read(row.ticket.id), field = P.deadlineField(ticket,await getSupportMessages(f.client,{ticketId:ticket.id}));
 assert.equal(ticket.priority,'HIGH'); assert.ok(field.value.includes(':F>')); assert.ok(field.value.includes(':R>'));
 assert.deepEqual(request.embeds[0].toJSON().fields[0],field);
 assert.deepEqual(f.overview.messages.cache.get(ticket.overviewMessageId).embeds[0].toJSON().fields.at(-1),field);
 assert.equal(P.waitingState({...ticket,closeRequestedAt:new Date(Date.now()-P.WAIT_MS-1),lastParticipantAt:new Date(Date.now()-P.WAIT_MS-2)},Date.now()),'USER');
 await manager.cancelClose(ticket.id); await P.recordParticipant(f.client,ticket.id,f.ids.creator,new Date(),null,false); await P.syncTicket(f.client,ticket.id);
 assert.equal(f.overview.messages.cache.get(ticket.overviewMessageId).embeds[0].toJSON().fields.length,5);
 await f.db.guild.update({where:{id:f.guildId},data:{autoClose:0}});
 await manager.scheduleClose(await f.read(ticket.id),request,f.ids.staff,null);
 assert.equal((await f.read(ticket.id)).closeScheduledAt,null);
});
test('SQLite: failed overview deletion retries after restart and orphan duplicates are recovered', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 await P.syncTicket(f.client,row.ticket.id); const ticket = await f.read(row.ticket.id);
 await f.db.ticket.update({where:{id:ticket.id},data:{open:false}}); f.overview.failDelete=true;
 await P.syncTicket(f.client,ticket.id);
	let saved=await f.read(ticket.id); assert.equal(saved.overviewMessageId,ticket.overviewMessageId); assert.equal(saved.presentationAttempts,1); assert.ok(saved.presentationNextAttemptAt>new Date());
	for (const minutes of [5,15,15]) { const before=Date.now(); await P.syncTicket(f.client,ticket.id); saved=await f.read(ticket.id); assert.ok(+saved.presentationNextAttemptAt-before>=minutes*60000); assert.ok(+saved.presentationNextAttemptAt-before<minutes*60000+5000); }
 await P.stopPresentations(f.client); f.overview.failDelete=false;
 await P.refreshPresentations(f.client); assert.equal((await f.read(ticket.id)).overviewMessageId,ticket.overviewMessageId);
 await P.refreshPresentations(f.client,true); assert.equal((await f.read(ticket.id)).overviewMessageId,null);
 const open = await f.create(); await P.syncTicket(f.client,open.ticket.id);
 const ot = await f.read(open.ticket.id), payload = P.overviewPayload(ot,await getSupportMessages(f.client,{ticketId:ot.id}));
 await f.overview.send(payload); await f.db.ticket.update({where:{id:ot.id},data:{overviewMessageId:null,overviewChannelId:null,open:false}});
 await P.refreshPresentations(f.client,true);
 assert.equal(f.overview.messages.cache.size,0); assert.equal((await f.read(ot.id)).overviewMessageId,null);
});
test('SQLite: offline messages ignore bots, systems and webhooks; slow renames do not block overview', sqlite, async t => {
 const f = await fixture(t), row = await f.create();
 const at = new Date(Date.now()-1000);
 row.channel.add({}, {id:f.ids.staff,bot:false}, at);
 row.channel.add({}, {id:f.ids.user,bot:false}, new Date(+at+100), {system:true});
 row.channel.add({}, {id:f.ids.user,bot:false}, new Date(+at+200), {webhookId:'webhook'});
 row.channel.add({}, {id:f.client.user.id,bot:true},new Date(+at+300));
 await P.syncTicket(f.client,row.ticket.id,{history:true}); assert.equal((await f.read(row.ticket.id)).lastParticipantSide,'STAFF');
 let resume;
 row.channel.renameGate=new Promise(resolve=>{resume=resolve;});
 await f.db.ticket.update({where:{id:row.ticket.id},data:{priority:'HIGH'}});
 try {
  await P.syncTicket(f.client,row.ticket.id); await tick();
  assert.ok((await f.read(row.ticket.id)).overviewMessageId);
  await f.db.ticket.update({where:{id:row.ticket.id},data:{open:false}});
  await P.syncTicket(f.client,row.ticket.id); assert.equal(f.overview.messages.cache.size,0);
 } finally { resume(); }
});
test('SQLite: claim race, staff handoff, authorization and rollback; category move releases assignment', sqlite, async t => {
 const f = await fixture(t), row = await f.create({priority:'HIGH'}), id = row.ticket.id;
 const act = (actorId,action,value) => actions.performAction(f.client,{guildId:f.guildId,ticketId:id,actorId,action,value});
 const claims = await Promise.allSettled([act(f.ids.staff,'claim'),act(f.ids.next,'claim')]);
 assert.equal(claims.filter(result=>result.status==='fulfilled').length,1);
 assert.equal((await f.read(id)).claimedById,f.ids.staff);
 assert.ok(row.channel.permissionOverwrites.cache.get(f.roles.de).deny.has('ViewChannel'));
 await assert.rejects(act(f.ids.next,'release'),error=>error.supportKey==='ticket.support.errors.assigned');
 await assert.rejects(act(f.ids.staff,'handoff',f.ids.outsider),error=>error.supportKey==='ticket.support.errors.target');
 await act(f.ids.staff,'handoff',f.ids.next);
 assert.equal((await f.read(id)).createdById,f.ids.creator); assert.equal((await f.read(id)).claimedById,f.ids.next);
 assert.equal(row.channel.permissionOverwrites.cache.has(f.ids.staff),false); assert.ok(row.channel.permissionOverwrites.cache.get(f.ids.next).allow.has('ViewChannel'));
 await act(f.ids.next,'release'); assert.equal((await f.read(id)).claimedById,null); assert.ok(row.channel.permissionOverwrites.cache.get(f.roles.de).allow.has('ViewChannel'));
 row.channel.failPermissions=true; await assert.rejects(act(f.ids.staff,'claim')); assert.equal((await f.read(id)).claimedById,null); row.channel.failPermissions=false;
 await act(f.ids.staff,'claim');
 await assert.rejects(act(f.ids.user,'priority','LOW'),error=>error.supportKey==='ticket.support.errors.forbidden');
 f.channel(f.en.discordCategory,'parent');
 await act(f.ids.admin,'move',String(f.en.id));
 const moved=await f.read(id); assert.equal(moved.categoryId,f.en.id); assert.equal(moved.claimedById,null); assert.equal(moved.priority,'HIGH'); assert.equal(moved.channelBaseName,'ticket-1');
 await act(f.ids.admin,'rename','🔴👤mein-ticket'); assert.equal((await f.read(id)).channelBaseName,'mein-ticket');
 await f.db.ticket.update({where:{id},data:{open:false}});
 await act(f.ids.admin,'priority','LOW');assert.equal((await f.read(id)).priority,'LOW');
 await f.db.ticket.update({where:{id},data:{channelDeletePending:true}});
 await assert.rejects(act(f.ids.admin,'priority','HIGH'),error=>error.supportKey==='ticket.support.errors.closed');
});
test('SQLite: creator transfer keeps ownership and staff handoff separate, status and priority survive', sqlite, async t => {
 const f = await fixture(t), row = await f.create({priority:'MEDIUM',lastParticipantSide:'STAFF',lastParticipantAt:new Date(Date.now()-600000)});
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:row.ticket.id,actorId:f.ids.creator,action:'transfer',value:f.ids.user});
 const ticket=await f.read(row.ticket.id); assert.equal(ticket.createdById,f.ids.user); assert.equal(ticket.claimedById,null); assert.equal(P.channelName(ticket),'🟠👤ticket-1');
 assert.equal(row.channel.topic,`<@${f.ids.user}>`); assert.ok(row.channel.permissionOverwrites.cache.get(f.ids.user).allow.has('ViewChannel'));
});
test('SQLite/admin API: private separate channels, bot permissions, switch, saved state and admin guard', sqlite, async t => {
 const f = await fixture(t), app=Fastify(); t.after(()=>app.close());
 const definitions=load('src/routes/api/admin/guilds/[guild]/settings.js',{'../../../../../lib/logging.js':{logAdminEvent:()=>{}}});
 app.decorate('authenticate',async req=>{req.user={id:f.ids.admin};});
 app.decorate('isAdmin',async(req,reply)=>{if(req.headers['x-admin']!=='yes') return reply.code(403).send({message:'Forbidden'});});
 for(const method of ['get','patch']) app.route({method:method.toUpperCase(),url:'/settings/:guild',config:{client:f.client},...definitions[method](app)});
 const url='/settings/'+f.guildId, headers={'x-admin':'yes'}, patch=payload=>app.inject({method:'PATCH',url,headers,payload});
 assert.equal((await app.inject({url})).statusCode,403);
 f.overview.private=false; assert.equal((await patch({ticketOverviewChannel:f.overview.id})).statusCode,400); f.overview.private=true;
 f.overview.canSend=false; assert.equal((await patch({ticketOverviewChannel:f.overview.id})).statusCode,400); f.overview.canSend=true;
 assert.equal((await patch({logChannel:f.overview.id})).statusCode,400);
 assert.equal((await patch({transcriptChannel:f.overview.id})).statusCode,400);
 assert.equal((await patch({ticketOverviewChannel:123})).statusCode,400);
 assert.equal((await patch({automaticTicketStatus:'false'})).statusCode,400);
 let response=await patch({automaticTicketStatus:false}); assert.equal(response.statusCode,200,response.body);
 assert.equal((await app.inject({url,headers})).json().automaticTicketStatus,false);
 response=await patch({ticketOverviewChannel:''}); assert.equal(response.statusCode,200,response.body); assert.equal(response.json().ticketOverviewChannel,null);
});
test('SQLite: support menu is private, category text applies and stale/foreign actions are refused', sqlite, async t => {
 const f=await fixture(t), row=await f.create({categoryId:f.en.id});
 const calls=[];
 function interaction(userId){return {channelId:row.ticket.id,guildId:f.guildId,user:{id:userId},deferReply:async function(value){this.deferred=true;calls.push(value);},editReply:async value=>calls.push(value),reply:async value=>calls.push(value)};}
 const id={ticket:row.ticket.id};
 await ui.runSupportUI(f.client,id,interaction(f.ids.admin)); assert.equal(calls[0].flags,D.MessageFlags.Ephemeral);
 assert.equal(calls[1].components[0].components[0].data.placeholder,'Choose action');
 calls.length=0; await ui.runSupportUI(f.client,id,interaction(f.ids.staff)); assert.ok(calls.at(-1).content.includes('berechtigt'));
 calls.length=0; await ui.runSupportUI(f.client,{ticket:'another'},interaction(f.ids.admin)); assert.equal(calls[0].flags,D.MessageFlags.Ephemeral); assert.equal((await f.read(row.ticket.id)).claimedById,null);
});
test('SQLite: attachment messages count; bot, webhook, system and private tag messages do not', sqlite, async t => {
 const f=await fixture(t), row=await f.create();
 await f.db.guild.update({where:{id:f.guildId},data:{autoTag:[]}});
 f.client.keyv={has:async()=>true}; row.channel.members=new D.Collection();
 const Listener=load('src/listeners/client/messageCreate.js',{'../../lib/users':{isStaff:async()=>true}});
 const listener=Object.create(Listener.prototype); listener.client=f.client;
 const human=row.channel.add({}, {id:f.ids.user,bot:false},new Date(Date.now()-2000));
 await listener.run({...human,content:'',attachments:new D.Collection([['image',{}]]),channel:row.channel,guild:f.guild});
 assert.equal((await f.read(row.ticket.id)).lastParticipantSide,'USER');
 const before=+(await f.read(row.ticket.id)).lastParticipantAt;
 for(const flags of [{author:{id:f.client.user.id,bot:true}},{webhookId:'hook'},{system:true}]) {
  await listener.run({...human,createdAt:new Date(),...flags,channel:row.channel,guild:f.guild});
  assert.equal(+(await f.read(row.ticket.id)).lastParticipantAt,before);
 }
 const tag=await f.db.tag.create({data:{guildId:f.guildId,name:'Hello',content:'Hello',regex:'hello'}});
 const Tag=load('src/commands/slash/tag.js',{'../../lib/ticket-actions':actions}); const command=Object.create(Tag.prototype); command.client=f.client;
 let publicReply=false; const replies=[];
 const interaction={guildId:f.guildId,channelId:row.ticket.id,user:{id:f.ids.staff},options:{getUser:()=>publicReply?{id:f.ids.creator,toString:()=>`<@${f.ids.creator}>`}:null,getInteger:()=>tag.id},deferReply:async payload=>replies.push(payload),editReply:async()=>{}};
 await command.run(interaction); assert.equal(+(await f.read(row.ticket.id)).lastParticipantAt,before); assert.equal(replies[0].flags,D.MessageFlags.Ephemeral); assert.equal((await f.read(row.ticket.id)).claimedById,null);
 publicReply=true; await command.run(interaction); assert.equal((await f.read(row.ticket.id)).lastParticipantSide,'STAFF'); assert.equal(replies[1].flags,0); assert.equal((await f.read(row.ticket.id)).claimedById,f.ids.staff);
});
test('SQLite: manual, confirmed, automatic and channel-deletion closure remove their overview only', sqlite, async t => {
 const f=await fixture(t), logs=[];
 const Manager=load('src/lib/tickets/manager.js',{'../threads':{pools:{crypto:{queue:async fn=>fn({encrypt:x=>x,decrypt:x=>x})}}},'../logging':{logTicketEvent:async(_,event)=>logs.push(event)},'./archiver':class{},'../stats':{},'../transcripts':{deliverTranscript:async()=>{}}});
 const manager=Object.create(Manager.prototype); manager.client=f.client; manager.$count=f.client.tickets.$count; manager.getTicket=id=>f.read(id); manager.archiver={flush:async()=>{}}; f.client.tickets=manager;
 const survivor=await f.create(); await P.syncTicket(f.client,survivor.ticket.id);
 for(const kind of ['manual','confirmed','automatic','deleted']) {
  const row=await f.create(); await P.syncTicket(f.client,row.ticket.id); const overviewId=(await f.read(row.ticket.id)).overviewMessageId;
  if(kind==='confirmed') {const request=row.channel.add({embeds:[new D.EmbedBuilder().setTitle('Close?')]});await manager.scheduleClose(await f.read(row.ticket.id),request,f.ids.creator,null);await manager.acceptClose({channel:row.channel,guild:f.guild,user:{id:f.ids.staff},editReply:async()=>{}},request.id);}
  else if(kind==='automatic') {const deadline=new Date(Date.now()-1000); await f.db.ticket.update({where:{id:row.ticket.id},data:{closeScheduledAt:deadline}}); await manager.finallyClose(row.ticket.id,{expectedCloseAt:deadline});}
  else if(kind==='deleted') {f.client.channels.cache.delete(row.ticket.id); await P.syncTicket(f.client,row.ticket.id);}
  else await manager.finallyClose(row.ticket.id,{closedBy:f.ids.staff});
  await P.syncTicket(f.client,row.ticket.id);
  const ticket=await f.read(row.ticket.id); assert.equal(ticket.open,false); assert.equal(ticket.overviewMessageId,null); assert.equal(f.overview.messages.cache.has(overviewId),false);
  assert.equal(f.overview.messages.cache.size,1);
 }
 assert.equal(logs.length,4); assert.ok(logs.every(event=>event.payload.files===undefined&&event.payload.components===undefined));
 assert.equal(f.errors.length,0,f.errors.map(error=>error.stack).join('\n'));
});
test('SQLite: overview channel change and disabling status apply without restart', sqlite, async t => {
 const f=await fixture(t), row=await f.create({priority:'HIGH'}); await P.syncTicket(f.client,row.ticket.id); await tick();
 const previous=(await f.read(row.ticket.id)).overviewMessageId, other=f.channel(f.guildId+'99','new-overview');
 await f.db.guild.update({where:{id:f.guildId},data:{ticketOverviewChannel:other.id,automaticTicketStatus:false}});
 await P.syncTicket(f.client,row.ticket.id); await P.stopPresentations(f.client);
 assert.equal(f.overview.messages.cache.has(previous),false); assert.equal(other.sent,1); assert.equal(row.channel.name,'🔴ticket-042');
 await f.db.guild.update({where:{id:f.guildId},data:{ticketOverviewChannel:null}}); await P.syncTicket(f.client,row.ticket.id);
 assert.equal(other.messages.cache.size,0); assert.equal((await f.read(row.ticket.id)).overviewMessageId,null);
});
test('SQLite: Discord user selector executes authorized handoff; category menu paginates within Discord limits', sqlite, async t => {
 const f=await fixture(t), row=await f.create(), calls=[];
 await actions.performAction(f.client,{guildId:f.guildId,ticketId:row.ticket.id,actorId:f.ids.staff,action:'claim'});
 const Listener=load('src/listeners/client/supportUserSelect.js',{'../../lib/ticket-support-ui':ui});
 const listener=Object.create(Listener.prototype); listener.client=f.client;
 const interaction={channelId:row.ticket.id,guildId:f.guildId,user:{id:f.ids.staff},values:[f.ids.next],customId:JSON.stringify({action:'support',ticket:row.ticket.id,step:'handoff'}),isUserSelectMenu:()=>true,deferReply:async function(payload){this.deferred=true;calls.push(payload);},editReply:async payload=>calls.push(payload)};
 await listener.run(interaction); assert.equal((await f.read(row.ticket.id)).claimedById,f.ids.next); assert.equal(calls[0].flags,D.MessageFlags.Ephemeral);
 for (let index=0;index<26;index++) await f.db.category.create({data:{guildId:f.guildId,name:'Additional '+index,channelName:'ticket-{number}',description:'Support',discordCategory:'parent',emoji:'🎫',openingMessage:'Hi',staffRoles:[]}});
 calls.length=0; interaction.user.id=f.ids.admin; interaction.values=[]; interaction.deferred=false;
 await ui.runSupportUI(f.client,{ticket:row.ticket.id,step:'move',page:0},interaction);
 assert.equal(calls.at(-1).components[0].components[0].options.length,25); assert.equal(calls.at(-1).components.length,2);
 calls.length=0; interaction.deferred=false; await ui.runSupportUI(f.client,{ticket:row.ticket.id,step:'move',page:1},interaction);
 assert.equal(calls.at(-1).components[0].components[0].options.length,2);
});
