const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const Discord = require('discord.js');
const YAML = require('yaml');
const I18n = require('@eartharoid/i18n');
process.env.ENCRYPTION_KEY = 'test-only-google-drive-encryption-key'.repeat(3);
const crypt = require('../src/lib/crypto');
const data = require('../src/lib/transcript-data');
const html = require('../src/lib/transcript-html');
const archive = require('../src/lib/drive-archive');
const { DriveError, GoogleDrive } = require('../src/lib/google-drive');
const sqlite = { skip: !process.env.TEST_DATABASE_URL };
const i18n = new I18n('en-GB', Object.fromEntries(['de','en-GB'].map(locale => [locale,YAML.parse(fs.readFileSync(path.join(__dirname,'../src/i18n/'+locale+'.yml'),'utf8'))])));
function load(file, overrides={}) {
 const absolute=path.join(__dirname,'..',file), module={exports:{}}, local=createRequire(absolute);
 vm.runInNewContext(fs.readFileSync(absolute,'utf8'),{module,Buffer,Date,process,URL,setTimeout:callback=>setTimeout(callback,0),require:name=>overrides[name]||local(name)});
 return module.exports;
}
const pools={transcript:{queue:async callback=>callback(ticket=>data.getTranscript(structuredClone(ticket)))},crypto:{queue:async callback=>callback(crypt)}};
const transcripts=load('src/lib/transcripts.js',{'./threads':{pools}});
require.cache[require.resolve('../src/lib/transcripts')]= {exports:transcripts};
function plainTicket() {
 return {id:'811111111111111111',guildId:'811111111111111112',number:42,createdAt:new Date('2026-10-02T10:00:00Z'),closedAt:new Date('2026-10-02T11:00:00Z'),guild:{locale:'de',textOverrides:{}},category:{name:'Deutsch',textOverrides:{}},createdById:'811111111111111113',createdBy:{displayName:'Nutzer'},archivedUsers:[{userId:'811111111111111113',displayName:'Nutzer',roleId:'role'},{userId:'811111111111111114',displayName:'Support',bot:true}],archivedRoles:[{roleId:'role',colour:'ff0000',name:'Support'}],archivedChannels:[],questionAnswers:[{question:{label:'Problem'},value:'Hilfe'}],pinnedMessageIds:[],archivedMessages:[]};
}
test('HTML: escaped Discord messages, Markdown, replies, embeds, controls, dates and inherited labels',()=>{
 const ticket=plainTicket();
 ticket.category.textOverrides={'ticket.transcript.html.creator':'Author'};
 ticket.guild.textOverrides={'ticket.transcript.html.questions':'Support questions'};
 ticket.archivedMessages=[
  {id:'1',authorId:ticket.createdById,createdAt:ticket.createdAt,edited:true,content:{content:'**Hallo** <@811111111111111114> <:test:811111111111111115> ||secret||\n<script>alert(1)</script>\n[jump](javascript:alert(1))'}},
  {id:'2',authorId:'811111111111111114',createdAt:new Date('2026-10-02T10:01:00Z'),content:{content:'Antwort',reference:'1',embeds:[{data:{title:'Ergebnis',description:'**Details**',fields:[{name:'Status',value:'Gut',inline:true}],footer:{text:'Kartell'}}}],components:[{components:[{type:2,label:'Schließen',custom_id:'secret-action',style:4}]}]}},
 ];
 const result=html.renderHtml(ticket,{i18n});
 assert.match(result,/<!doctype html>/); assert.match(result,/<strong>Hallo<\/strong>/); assert.match(result,/@Support/);
 assert.match(result,/class="reply"/); assert.match(result,/#message-1/); assert.match(result,/Ergebnis/); assert.match(result,/Schließen/);
 assert.match(result,/Author/); assert.match(result,/Support questions/); assert.match(result,/class="spoiler"/); assert.match(result,/UTC/);
 assert.doesNotMatch(result,/<script>|href="javascript:|custom_id|secret-action|onclick=/); assert.match(result,/&lt;script&gt;/);
});
test('HTML: offline relative paths, unavailable files, default avatars, grouping and old empty archives',()=>{
 const ticket=plainTicket(), url='https://cdn.discordapp.com/attachments/1/2/pic.png';
 ticket.archivedMessages=[{id:'1',authorId:ticket.createdById,createdAt:ticket.createdAt,content:{attachments:[{id:'2',name:'pic.png',url,size:10}],content:'first'}},{id:'2',authorId:ticket.createdById,createdAt:new Date('2026-10-02T10:00:30Z'),deleted:true,content:{attachments:[{id:'3',name:'lost.txt',url}],content:'second'}}];
 const result=html.renderHtml(ticket,{i18n,assets:new Map([['attachment:2',{path:'files/pic.png'}],['attachment:3',{path:null}]])});
 assert.match(result,/src="files\/pic.png"/); assert.match(result,/Datei nicht verfügbar/); assert.match(result,/Archiv ist unvollständig/); assert.match(result,/message grouped/); assert.match(result,/im Ticket gelöscht/);
 assert.doesNotMatch(result,/src="https:/); assert.match(html.renderHtml(plainTicket(),{i18n}),/Keine archivierten Nachrichten/);
 assert.equal(html.safeUrl('javascript:alert(1)'),''); assert.equal(html.safeUrl('https://secret@evil.test/a'),'');
});
test('archive paths and fetch allowlist reject traversal, executable URL schemes and unrelated hosts',()=>{
 assert.throws(()=>archive.spool('../outside'),/UNSAFE_URL/); assert.throws(()=>archive.spool('811111111111111111','../../outside'),/UNSAFE_URL/);
 assert.equal(archive.sourceUrl('https://localhost/attachments/x'),null); assert.equal(archive.sourceUrl('https://cdn.discordapp.com.evil.test/attachments/x'),null);
 assert.equal(archive.sourceUrl('https://cdn.discordapp.com:444/attachments/x'),null); assert.equal(archive.sourceUrl('file:///etc/passwd'),null);
 assert.doesNotMatch(archive.filename('../../CON:bad/file.exe'), /[\\/]|^\./); assert.equal(archive.filename('CON'), '_CON');
});

test('Discord media IDs stay stable across renewed signatures and CDN proxy URLs',()=>{
 const first='https://cdn.discordapp.com/attachments/111/222/pic.png?ex=old&hm=old';
 const second='https://media.discordapp.net/attachments/111/222/pic.png?ex=new&hm=new';
 assert.equal(html.discordAssetKey(first),'attachment:222');assert.equal(html.discordAssetKey(second),'attachment:222');
 const original=archive.contentAssets({embeds:[{image:{url:first}}]},'1');
 const renewed=archive.contentAssets({embeds:[{image:{url:second}}]},'2');
 assert.equal(original.find(a=>a.name==='embed.png').key,renewed.find(a=>a.name==='embed.png').key);
 assert.equal(html.discordAssetKey('https://cdn.discordapp.com/avatars/111/hash.png?size=128'),'https://cdn.discordapp.com/avatars/111/hash.png');
});
test('Google Drive validates private folders and never exposes credentials in API errors',async()=>{
 const drive=new GoogleDrive({clientId:'private-client',clientSecret:'secret-credentials',refreshToken:'private-refresh',rootFolderId:'root'},async(url,options)=>{
  if(url.includes('oauth2.googleapis')) return Response.json({access_token:'secret-token',expires_in:3600});
  assert.equal(options.redirect,'manual'); assert.equal(options.headers.Authorization,'Bearer secret-token');
  return Response.json({mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true},appProperties:{ticketArchiveRoot:'1'},permissions:[{role:'owner'},{role:'reader',type:'anyone'}]});
 });
 await assert.rejects(drive.validateRoot(),error=>error.code==='NOT_PRIVATE' && !/secret|refresh/.test(error.message));
 await assert.rejects(drive.request('https://evil.test/'),/UNSAFE_URL/);
 const auth=new GoogleDrive({clientId:'c',clientSecret:'VERY_SECRET',refreshToken:'SECRET_REFRESH'},async()=>Response.json({error:'invalid_grant',secret:'VERY_SECRET'},{status:400}));
 await assert.rejects(auth.accessToken(),error=>error.code==='AUTH' && !error.message.includes('SECRET'));
});
test('Google resumable upload probes persisted sessions and resumes at acknowledged byte offset',async t=>{
 const location=path.join(__dirname,'../../drive-upload-test.bin');
 fs.writeFileSync(location,Buffer.alloc(12,1)); t.after(()=>fs.rmSync(location,{force:true}));
 const requests=[],progress=[];
 const drive=new GoogleDrive({clientId:'c',clientSecret:'s',refreshToken:'r'},async(url,options)=>{
  if(url.includes('oauth2.googleapis')) return Response.json({access_token:'token',expires_in:3600});
  if(url.includes('/files/file?')) return new Response(null,{status:404});
  requests.push(options.headers['Content-Range']);
  if(options.headers['Content-Length']==='0') return new Response(null,{status:308,headers:{range:'bytes=0-3'}});
  assert.equal(options.headers['Content-Range'],'bytes 4-11/12');
  for await(const chunk of options.body) assert.equal(chunk.length,8);
  return Response.json({id:'file'});
 });
 await drive.upload({fileId:'file',localPath:location,parent:'root',name:'file',mime:'application/octet-stream',ticketId:'ticket',assetId:'asset',session:'https://www.googleapis.com/upload/drive/v3/files?upload_id=session'},async(s,n)=>progress.push([s,n]));
 assert.deepEqual(requests,['bytes */12','bytes 4-11/12']); assert.deepEqual(progress,[[null,12]]);
});
let sequence=0;
async function fixture(t) {
 const prisma=new PrismaClient({datasources:{db:{url:process.env.TEST_DATABASE_URL}}});
 prisma.$use(require('../src/lib/middleware/prisma-sqlite'));
 const id=String(830000000000000000n+BigInt(Date.now())*100n+BigInt(++sequence)), userId=String(BigInt(id)+1n);
 await prisma.guild.create({data:{id,locale:'de',archive:true,driveArchiveEnabled:true,transcriptChannel:'523456789012345678'}});
 await prisma.user.upsert({where:{id:userId},update:{},create:{id:userId}});
 const category=await prisma.category.create({data:{guildId:id,name:'Deutsch',channelName:'ticket-{number}',description:'Support',discordCategory:'category',emoji:'🎫',openingMessage:'Hi',staffRoles:[]}});
 const ticket=await prisma.ticket.create({data:{id:String(BigInt(id)+2n),guildId:id,number:42,categoryId:category.id,createdById:userId,openingMessageId:'opening'}});
 const files=new Map(), warnings=[]; let generated=0;
 const adapter={config:{rootFolderId:'root'},validateRoot:async()=>{if(adapter.failure)throw new DriveError(adapter.failure)},id:async()=> 'file-'+(++generated),folder:async()=>{},upload:async(input,save)=>{if(adapter.failure)throw new DriveError(adapter.failure);await save('https://www.googleapis.com/upload/drive/v3/files?upload_id=private',0);files.set(input.fileId,fs.readFileSync(input.localPath));await save(null,files.get(input.fileId).length)},download:async(id,target)=>{if(!files.has(id))throw new DriveError('MISSING');fs.writeFileSync(target,files.get(id))},remove:async(id)=>{if(adapter.deleteFailure)throw new DriveError('DELETE');files.delete(id)}};
 const messages=new Discord.Collection();
 const transcriptMessage={id:'message',author:{id:'bot'},attachments:new Discord.Collection([['html',{id:'html',name:'ticket-42.html'}]]),edit:async payload=>{transcriptMessage.payload=payload;if(payload.files)transcriptMessage.attachments.set('zip',{id:'zip',name:payload.files[0].name})}};
 const channel={id:'523456789012345678',guildId:id,guild:{premiumTier:0},messages:{fetch:async query=>typeof query==='string'?transcriptMessage:messages}};
 const client={prisma,i18n,driveAdapter:adapter,user:{id:'bot'},config:{templates:{transcript:'transcript.md'}},guilds:{cache:new Discord.Collection([[id,{name:'Support',premiumTier:0}]])},channels:{fetch:async()=>channel},log:{warn:(...args)=>warnings.push(args.join(' ')),error(){}}};
 async function full() {return prisma.ticket.findUnique({where:{id:ticket.id},include:transcripts.transcriptInclude});}
 t.after(async()=>{await prisma.driveAsset.deleteMany({where:{archiveId:ticket.id}});await prisma.driveArchive.deleteMany({where:{id:ticket.id}});await prisma.guild.delete({where:{id}});await prisma.user.deleteMany({where:{id:userId}});await prisma.$disconnect();const target=archive.spool(ticket.id);assert.ok(target.startsWith(path.resolve('./user/drive-spool')+path.sep));await fs.promises.rm(target,{recursive:true,force:true});});
 async function record(withAttachment=true) {
  const url='https://cdn.discordapp.com/attachments/'+ticket.id+'/911111111111111111/pic.png';
  const imageBytes=fs.readFileSync(path.join(__dirname,'../portal/static/favicon.png'));
  const content={content:'**Hallo**',author:{userId,displayName:'Nutzer'},attachments:withAttachment?[{id:'911111111111111111',name:'pic.png',url,size:imageBytes.length,contentType:'image/png'}]:[]};
  await prisma.archivedRole.create({data:{ticketId:ticket.id,roleId:'role',name:'Role',colour:'ffffff'}});
  await prisma.archivedUser.create({data:{ticketId:ticket.id,userId,roleId:'role',username:crypt.encrypt('User'),displayName:crypt.encrypt('Nutzer')}});
  await prisma.archivedMessage.create({data:{id:String(BigInt(ticket.id)+4n),ticketId:ticket.id,authorId:userId,content:crypt.encrypt(JSON.stringify(content))}});
  client.archiveFetch=async()=>new Response(imageBytes);
  await archive.captureContent(client,await full(),content,String(BigInt(ticket.id)+4n));
  const assets=await prisma.driveAsset.findMany({where:{archiveId:ticket.id}});
  await Promise.all(assets.map(a=>archive.processAsset(client,a.id)));
  return assets;
 }
 async function close() {
  await prisma.ticket.update({where:{id:ticket.id},data:{open:false,closedAt:new Date(),transcriptMessageId:'message'}});
  await archive.markClosed(client,await full()); await archive.processArchive(client,ticket.id);
 }
 return {prisma,client,ticket,id,userId,adapter,files,warnings,record,close,full,transcriptMessage,messages};
}
test('SQLite: immediate byte backup, deduplication, offline ZIP, same-message delivery, private downloads and 90-day expiry',sqlite,async t=>{
 const f=await fixture(t), assets=await f.record();
 assert.equal((await f.prisma.driveAsset.findMany({where:{archiveId:f.ticket.id,state:'ready'}})).length,assets.length);
 const original=await f.prisma.archivedMessage.findFirst({where:{ticketId:f.ticket.id}});
 await archive.captureContent(f.client,await f.full(),JSON.parse(crypt.decrypt(original.content)),original.id);
 assert.equal(await f.prisma.driveAsset.count({where:{archiveId:f.ticket.id}}),assets.length);
 await f.close();
 const row=await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}});
 assert.equal(row.state,'ready'); assert.equal(row.discordDelivered,true); assert.equal(row.complete,true);
 assert.equal(row.expiresAt-row.closedAt,archive.RETENTION); assert.equal(f.transcriptMessage.payload.files[0].name,'ticket-42.zip');
 const zip=await archive.acquireZip(f.client,f.ticket.id,1024*1024);
 const entries=await require('unzipper').Open.file(zip.path);const names=entries.files.map(e=>e.path);
 assert.ok(names.includes('transcript.html'));assert.ok(names.includes('archive-info.json'));assert.ok(names.some(n=>n.endsWith('-pic.png')));
 const document=(await entries.files.find(e=>e.path==='transcript.html').buffer()).toString();
 assert.match(document,/src="files\//);assert.doesNotMatch(document,/src="https:/);
 await zip.release();assert.equal(fs.existsSync(zip.path),false);
 await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{expiresAt:new Date(Date.now()-1000)}});
 assert.equal(await archive.acquireZip(f.client,f.ticket.id,1024*1024),null);
 await archive.processArchive(f.client,f.ticket.id);
 assert.equal((await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}})).state,'deleted');
 assert.equal(f.files.size,0);assert.equal(await f.prisma.archivedMessage.count({where:{ticketId:f.ticket.id}}),1);
});
test('SQLite: quota errors retain staged bytes and retries; closure survives; retry does not redownload',sqlite,async t=>{
 const f=await fixture(t);f.adapter.failure='QUOTA';const assets=await f.record();
 let row=await f.prisma.driveAsset.findUnique({where:{id:assets[0].id}});
 assert.equal(row.state,'pending');assert.equal(row.localReady,true);assert.equal(row.errorCode,'QUOTA');assert.ok(row.nextAttemptAt-Date.now()<=60000);
 await f.close();assert.equal((await f.full()).open,false);
 f.client.archiveFetch=async()=>{throw new Error('Must not redownload bytes')};f.adapter.failure=null;
 for(const a of assets){await f.prisma.driveAsset.update({where:{id:a.id},data:{nextAttemptAt:null,leaseUntil:null}});await archive.processAsset(f.client,a.id)}
 await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{nextAttemptAt:null}});
 await archive.processArchive(f.client,f.ticket.id);assert.equal((await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}})).state,'ready');
});
test('SQLite: attachment downloads continue while both Drive upload slots are occupied',sqlite,async t=>{
 const f=await fixture(t), downloaded=new Set();
 let releaseUploads, finishDownloads;
 const uploads=new Promise(resolve=>{releaseUploads=resolve});
 const downloads=new Promise(resolve=>{finishDownloads=resolve});
 const originalUpload=f.adapter.upload;
 f.adapter.upload=async(...args)=>{await uploads;return originalUpload(...args)};
 f.client.archiveFetch=async url=>{downloaded.add(url);if(downloaded.size===4)finishDownloads();return new Response(Buffer.from('img'))};
 const content={attachments:[1,2,3].map(n=>({id:String(912222222222222220n+BigInt(n)),name:'pic-'+n+'.png',url:'https://cdn.discordapp.com/attachments/'+f.ticket.id+'/'+String(912222222222222220n+BigInt(n))+'/pic.png',size:3,contentType:'image/png'}))};
 await archive.captureContent(f.client,await f.full(),content,'message');
 const assets=await f.prisma.driveAsset.findMany({where:{archiveId:f.ticket.id}});
 let timeout;
 try{
  await Promise.race([downloads,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Attachment downloads stalled behind Drive uploads')),1500)})]);
  await archive.stageTicketAssets(f.client,f.ticket.id);
  const saved=await f.prisma.driveAsset.findMany({where:{archiveId:f.ticket.id}});
  assert.equal(saved.filter(row=>row.localReady||row.state==='ready').length,4);
 }finally{
  clearTimeout(timeout);releaseUploads();await Promise.all(assets.map(asset=>archive.processAsset(f.client,asset.id)));
 }
});
test('SQLite: forced closure recovers final messages and stages files before deleting the channel, without waiting for Drive',sqlite,async t=>{
 const f=await fixture(t),role={id:f.id,name:'Support',hexColor:'#ff9900'};
 const guild=f.client.guilds.cache.get(f.id);Object.assign(guild,{id:f.id,roles:{everyone:role},iconURL:()=>null,members:{cache:new Discord.Collection(),fetch:async()=>({})}});
 const user={id:f.userId,username:'User',globalName:'Nutzer',bot:false,discriminator:'0',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 const bot={...user,id:'bot',username:'KartelBot',bot:true};
 const message=(author,id,extra)=>({id,guild,author,member:{guild,user:author,displayName:author.username,roles:{hoist:role},displayAvatarURL:author.displayAvatarURL},mentions:{channels:new Discord.Collection(),members:new Discord.Collection(),roles:new Discord.Collection()},attachments:new Discord.Collection(),components:[],embeds:[],content:'',createdAt:new Date(),reference:null,...extra});
 const opening=message(bot,String(BigInt(f.ticket.id)+5n),{embeds:[new Discord.EmbedBuilder().setTitle('Welcome').setDescription('Support information')],components:[new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setCustomId('close').setStyle(4).setLabel('Schließen'))]});
 const attachments=[1,2,3].map(n=>({id:String(913333333333333330n+BigInt(n)),name:'pic-'+n+'.png',url:'https://cdn.discordapp.com/attachments/'+f.ticket.id+'/'+String(913333333333333330n+BigInt(n))+'/pic.png',size:3,contentType:'image/png'}));
 const response=message(user,String(BigInt(f.ticket.id)+6n),{content:'Final message',attachments:new Discord.Collection(attachments.map(a=>[a.id,a]))});
 f.messages.set(opening.id,opening);f.messages.set(response.id,response);
 let deleted=false, stagedAtDeletion,releaseUploads,timeout;
 const uploads=new Promise(resolve=>{releaseUploads=resolve}),originalUpload=f.adapter.upload;
 f.adapter.upload=async(...args)=>{await uploads;return originalUpload(...args)};
 f.client.archiveFetch=async()=>new Response(deleted?null:Buffer.from('img'),{status:deleted?404:200});
 const ticketChannel={id:f.ticket.id,guild,deletable:true,messages:{fetch:async()=>f.messages,fetchPinned:async()=>new Discord.Collection([[opening.id,opening]])},delete:async()=>{stagedAtDeletion=await f.prisma.driveAsset.findMany({where:{archiveId:f.ticket.id}});deleted=true}};
 const fetchChannel=f.client.channels.fetch;
 f.client.channels={cache:new Discord.Collection([[f.ticket.id,ticketChannel]]),fetch:async id=>id===f.ticket.id?ticketChannel:fetchChannel(id)};
 const Archiver=load('src/lib/tickets/archiver.js',{'../threads':{pools}});
 const Manager=load('src/lib/tickets/manager.js',{'../threads':{pools},'../stats':{},'./archiver':Archiver,'../ticket-presentation':{syncTicket:async()=>{},requestSync(){}},'../logging':{logTicketEvent:async()=>{}},'../transcripts':transcripts});
 const manager=Object.create(Manager.prototype);manager.client=f.client;manager.$count={categories:{}};manager.archiver=new Archiver(f.client);
 manager.getTicket=id=>f.prisma.ticket.findUnique({where:{id},include:{guild:true,category:true,feedback:true}});f.client.tickets=manager;
 const closing=manager.finallyClose(f.ticket.id,{closedBy:f.userId});
 try{
  await Promise.race([closing,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Closure waited for Drive upload')),5000)})]);
  assert.equal(deleted,true);assert.equal((await f.full()).open,false);assert.equal(f.files.size,0);
  assert.equal(stagedAtDeletion.length,4);assert.ok(stagedAtDeletion.every(asset=>asset.localReady||asset.state==='ready'));
  const document=await transcripts.renderTranscript(f.client,await f.full());
  assert.match(document.transcript,/Welcome/);assert.match(document.transcript,/Schließen/);assert.match(document.transcript,/Final message/);
 }finally{
  clearTimeout(timeout);releaseUploads();await closing;
  const assets=await f.prisma.driveAsset.findMany({where:{archiveId:f.ticket.id}});await Promise.all(assets.map(asset=>archive.processAsset(f.client,asset.id)));
  await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{nextAttemptAt:null}});await archive.processArchive(f.client,f.ticket.id);
 }
 const zip=await archive.acquireZip(f.client,f.ticket.id,1024*1024),entries=await require('unzipper').Open.file(zip.path);
 assert.ok(attachments.every(a=>entries.files.some(entry=>entry.path.endsWith(a.name))));
 assert.doesNotMatch((await entries.files.find(entry=>entry.path==='transcript.html').buffer()).toString(),/src="https:/);await zip.release();
});
test('SQLite: unavailable bytes produce an explicitly incomplete ZIP and HTML',sqlite,async t=>{
 const f=await fixture(t);f.client.archiveFetch=async()=>new Response(null,{status:404});
 await archive.ensureArchive(f.client,await f.full());
 const url='https://cdn.discordapp.com/avatars/911111111111111111/deadbeef.png';
 await f.prisma.driveAsset.create({data:{id:'missing-'+f.ticket.id,archiveId:f.ticket.id,assetKey:url,sourceUrl:crypt.encrypt(url),fileName:'avatar.png',relativePath:'files/missing.png',mime:'image/png'}});
 await archive.processAsset(f.client,'missing-'+f.ticket.id);await f.close();
 const row=await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}});assert.equal(row.complete,false);
 const zip=await archive.acquireZip(f.client,f.ticket.id,1024*1024),entries=await require('unzipper').Open.file(zip.path);
 assert.match((await entries.files.find(e=>e.path==='transcript.html').buffer()).toString(),/Archiv ist unvollständig/);
 assert.equal(JSON.parse((await entries.files.find(e=>e.path==='archive-info.json').buffer()).toString()).complete,false);await zip.release();
});
test('SQLite: delete failures persist after database ticket removal; uploads are not exported or restored',sqlite,async t=>{
 const f=await fixture(t);await f.record();await f.close();await f.prisma.ticket.delete({where:{id:f.ticket.id}});
 f.adapter.deleteFailure=true;await archive.tick(f.client);
 let row=await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}});assert.equal(row.state,'deleting');assert.equal(row.errorCode,'DELETE');assert.ok(row.nextAttemptAt>Date.now());
 assert.equal(await archive.acquireZip(f.client,f.ticket.id,1024*1024),null);
 f.adapter.deleteFailure=false;await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{nextAttemptAt:null}});
 await archive.tick(f.client);assert.equal((await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}})).state,'deleted');assert.equal(f.files.size,0);
});
test('SQLite: expired archives wait for an active download and reject new downloads',sqlite,async t=>{
 const f=await fixture(t);await f.record();await f.close();const zip=await archive.acquireZip(f.client,f.ticket.id,1024*1024);
 await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{expiresAt:new Date(Date.now()-1)}});await archive.processArchive(f.client,f.ticket.id);
 assert.equal((await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}})).state,'deleting');assert.equal(await archive.acquireZip(f.client,f.ticket.id,1024*1024),null);
 await zip.release();await archive.processArchive(f.client,f.ticket.id);assert.equal((await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}})).state,'deleted');
});
test('SQLite: ZIP too large preserves HTML attachment and completes delivery with a clear private-Drive notice',sqlite,async t=>{
 const f=await fixture(t);await f.record();await f.close();
 await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{discordDelivered:false,zipSize:200*1024*1024}});
 f.transcriptMessage.attachments.delete('zip');await archive.processArchive(f.client,f.ticket.id);
 assert.equal(f.transcriptMessage.payload.files,undefined);assert.deepEqual(f.transcriptMessage.payload.attachments,[{id:'html'}]);assert.match(f.transcriptMessage.payload.content,/Discord-Dateilimit/);
 assert.equal((await archive.acquireZip(f.client,f.ticket.id,10*1024*1024)).tooLarge,true);
});


test('Desktop OAuth: loopback state, PKCE, drive.file and private credential output',async t=>{
 const folder=path.join(__dirname,'../../oauth-helper-test');fs.mkdirSync(folder,{recursive:true});t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const clientFile=path.join(folder,'client.json'),outputFile=path.join(folder,'auth.json'),logs=[];
 fs.writeFileSync(clientFile,JSON.stringify({installed:{client_id:'desktop-id',client_secret:'PRIVATE_CLIENT_SECRET'}}));
 let challenge;
 await require('../scripts/connect-google-drive').connect({clientFile,outputFile,log:value=>logs.push(value),openBrowser:async address=>{
  const url=new URL(address);assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  challenge=url.searchParams.get('code_challenge');
  const callback=new URL(url.searchParams.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1');
  callback.search=new URLSearchParams({state:'incorrect',code:'private-code'});assert.equal((await fetch(callback)).status,400);
  callback.search=new URLSearchParams({state:url.searchParams.get('state'),code:'private-code'});assert.equal((await fetch(callback)).status,200);
 },request:async(url,options)=>{
  if(url.includes('oauth2.googleapis')) {
   const values=options.body;assert.equal(values.get('code'),'private-code');
   assert.equal(require('node:crypto').createHash('sha256').update(values.get('code_verifier')).digest('base64url'),challenge);
   return Response.json({access_token:'PRIVATE_ACCESS_TOKEN',refresh_token:'PRIVATE_REFRESH_TOKEN'});
  }
  assert.equal(options.headers.Authorization,'Bearer PRIVATE_ACCESS_TOKEN');const body=JSON.parse(options.body);
  assert.equal(body.mimeType,'application/vnd.google-apps.folder');assert.equal(body.appProperties.ticketArchiveRoot,'1');assert.equal(body.permissions,undefined);
  return Response.json({id:'private-root'});
 }});
 const saved=JSON.parse(fs.readFileSync(outputFile,'utf8'));assert.equal(saved.rootFolderId,'private-root');assert.equal(saved.refreshToken,'PRIVATE_REFRESH_TOKEN');
 assert.doesNotMatch(logs.join(' '),/PRIVATE_CLIENT_SECRET|PRIVATE_ACCESS_TOKEN|PRIVATE_REFRESH_TOKEN|private-code/);
 await assert.rejects(require('../scripts/connect-google-drive').connect({clientFile,outputFile}),/already exists/);
});
test('Drive download failures never expose a partial final file or retain partial bytes',async t=>{
 const destination=path.join(__dirname,'../../drive-download-test.bin');t.after(()=>fs.rmSync(destination,{force:true}));
 const drive=new GoogleDrive({clientId:'c',clientSecret:'s',refreshToken:'r'},async url=>{
  if(url.includes('oauth2.googleapis'))return Response.json({access_token:'token'});
  return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2]));controller.error(new Error('Interrupted'));}}));
 });
 await assert.rejects(drive.download('file',destination),/Interrupted/);assert.equal(fs.existsSync(destination),false);assert.equal(fs.existsSync(destination+'.part'),false);
});
test('SQLite: simultaneous downloads wait for the complete shared ZIP',sqlite,async t=>{
 const f=await fixture(t);await f.record();await f.close();
 let finish,started;const blocked=new Promise(resolve=>finish=resolve),begun=new Promise(resolve=>started=resolve);
 f.adapter.download=async(id,target)=>{fs.writeFileSync(target,'partial');started();await blocked;fs.writeFileSync(target,f.files.get(id));};
 const first=archive.acquireZip(f.client,f.ticket.id,1024*1024);await begun;
 let secondResolved=false;const second=archive.acquireZip(f.client,f.ticket.id,1024*1024).then(result=>{secondResolved=true;return result});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(secondResolved,false);
 finish();const copies=await Promise.all([first,second]);assert.ok(fs.readFileSync(copies[0].path).subarray(0,2).equals(Buffer.from('PK')));
 await copies[0].release();assert.equal(fs.existsSync(copies[1].path),true);await copies[1].release();
});
test('SQLite: durable retry schedule and progress survive a new client and expire during an outage',sqlite,async t=>{
 const f=await fixture(t);f.adapter.failure='AUTH';const [asset]=await f.record();
 for(const milliseconds of [300000,900000,900000]){
  await f.prisma.driveAsset.update({where:{id:asset.id},data:{nextAttemptAt:null}});
  const renewed={...f.client};await archive.processAsset(renewed,asset.id);
  const row=await f.prisma.driveAsset.findUnique({where:{id:asset.id}});
  assert.ok(row.nextAttemptAt-Date.now()>milliseconds-2000);assert.ok(row.nextAttemptAt-Date.now()<=milliseconds);
  assert.equal(row.localReady,true);
 }
 await f.prisma.driveAsset.update({where:{id:asset.id},data:{driveFileId:'unfinished-upload'}});
 await f.close();await f.prisma.driveArchive.update({where:{id:f.ticket.id},data:{expiresAt:new Date(Date.now()-1),nextAttemptAt:new Date(Date.now()+900000)}});
 f.adapter.deleteFailure=true;await archive.processArchive(f.client,f.ticket.id);
 const row=await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}});assert.equal(row.state,'deleting');
 assert.equal(fs.existsSync(archive.spool(f.ticket.id)),false);assert.equal(await archive.acquireZip(f.client,f.ticket.id,1024*1024),null);
});
test('SQLite: startup captures offline messages and edits with real archiver; closed tickets are not backfilled',sqlite,async t=>{
 const f=await fixture(t),role={id:f.id,name:'Support',hexColor:'#ff9900'};
 const guild={id:f.id,roles:{everyone:role}},user={id:f.userId,username:'User',globalName:'Nutzer',bot:false,discriminator:'0',displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 const contentURL='https://cdn.discordapp.com/attachments/'+f.ticket.id+'/911111111111111111/pic.png';
 const message={id:String(BigInt(f.ticket.id)+4n),guild,author:user,member:{guild,user,displayName:'Nutzer',roles:{hoist:role},displayAvatarURL:user.displayAvatarURL},mentions:{channels:new Discord.Collection(),members:new Discord.Collection(),roles:new Discord.Collection()},attachments:new Discord.Collection([['911111111111111111',{id:'911111111111111111',name:'pic.png',url:contentURL,size:3,contentType:'image/png'}]]),components:[],embeds:[],content:'Offline message',createdAt:new Date(),reference:null};
 f.messages.set(message.id,message);f.client.archiveFetch=async()=>new Response(Buffer.from('img'));
 const Archiver=load('src/lib/tickets/archiver.js',{'../threads':{pools}});
 f.client.tickets={archiver:new Archiver(f.client)};f.client.log.verbose=()=>{};
 await archive.tick(f.client,true);
 let saved=await f.prisma.archivedMessage.findUnique({where:{id:message.id}});
 assert.equal(JSON.parse(crypt.decrypt(saved.content)).content,'Offline message');assert.ok(await f.prisma.driveAsset.count({where:{archiveId:f.ticket.id,state:'ready'}})>=2);
 message.content='Edited offline';message.editedAt=new Date();await archive.tick({...f.client},true);
 saved=await f.prisma.archivedMessage.findUnique({where:{id:message.id}});assert.equal(saved.edited,true);assert.equal(JSON.parse(crypt.decrypt(saved.content)).content,'Edited offline');
 await f.prisma.driveArchive.delete({where:{id:f.ticket.id}});await f.prisma.ticket.update({where:{id:f.ticket.id},data:{open:false,closedAt:new Date()}});
 await archive.tick({...f.client},true);assert.equal(await f.prisma.driveArchive.findUnique({where:{id:f.ticket.id}}),null);
});
test('admin Drive status omits credentials, session URLs and private folder IDs',sqlite,async t=>{
 const f=await fixture(t);f.adapter.failure='QUOTA';await f.record();
 const status=await archive.driveStatus(f.client,f.id);
 assert.equal(status.connected,false);assert.equal(status.error,'QUOTA');assert.ok(status.pending>0);
 assert.doesNotMatch(JSON.stringify(status),/refreshToken|uploadSession|sourceUrl|rootFolderId|fileId|www.googleapis/);
 const route=require('../src/routes/api/admin/guilds/[guild]/drive');
 const authenticate=()=>{},isAdmin=()=>{};assert.deepEqual(route.get({authenticate,isAdmin}).onRequest,[authenticate,isAdmin]);
});

test('Drive folder purge refuses foreign files and never deletes the shared root',async()=>{
 const methods=[];
 const drive=new GoogleDrive({clientId:'c',clientSecret:'s',refreshToken:'r'},async(url,options)=>{
  methods.push(options.method||'GET');
  if(url.includes('oauth2.googleapis'))return Response.json({access_token:'token'});
  if(url.includes('/files/folder?'))return Response.json({mimeType:'application/vnd.google-apps.folder',appProperties:{ticketArchive:'ticket'}});
  if(url.includes('/files/root?'))return Response.json({mimeType:'application/vnd.google-apps.folder',appProperties:{ticketArchiveRoot:'1'}});
  return Response.json({files:[{id:'foreign',appProperties:{}}]});
 });
 await assert.rejects(drive.remove('folder','ticket'),/DELETE_REFUSED/);
 await assert.rejects(drive.remove('root','ticket'),/DELETE_REFUSED/);assert.ok(!methods.includes('DELETE'));
});
test('Drive upload rejects a pre-existing file moved outside the ticket folder',async t=>{
 const destination=path.join(__dirname,'../../drive-conflict-test.bin');fs.writeFileSync(destination,'data');t.after(()=>fs.rmSync(destination,{force:true}));
 const drive=new GoogleDrive({clientId:'c',clientSecret:'s',refreshToken:'r'},async url=>url.includes('oauth2.googleapis')?Response.json({access_token:'token'}):Response.json({id:'file',size:'4',parents:['different-folder'],appProperties:{ticketArchive:'ticket',asset:'asset'}}));
 await assert.rejects(drive.upload({fileId:'file',parent:'correct-folder',localPath:destination,ticketId:'ticket',assetId:'asset'},()=>{}),/FILE_CONFLICT/);
});
test('HTML: external media stay links in both standalone and offline documents',()=>{
 const ticket=plainTicket();ticket.archivedMessages=[{id:'1',authorId:ticket.createdById,createdAt:ticket.createdAt,content:{embeds:[{image:{url:'https://example.com/media.png'}}]}}];
 for(const assets of [undefined,new Map()]){
  const document=html.renderHtml(ticket,{i18n,assets});assert.match(document,/href="https:\/\/example.com\/media.png"/);assert.doesNotMatch(document,/src="https:\/\/example.com/);
 }
});

test('standalone HTML marks known unavailable attachments and embed previews explicitly',()=>{
 const ticket=plainTicket(),url='https://cdn.discordapp.com/attachments/1/2/missing.png';
 ticket.archivedMessages=[{id:'1',authorId:ticket.createdById,createdAt:ticket.createdAt,content:{attachments:[{id:'2',name:'missing.png',url}],embeds:[{image:{url:'attachment://missing.png'}}]}}];
 const document=html.renderHtml(ticket,{i18n,missingAssets:new Set(['attachment:2'])});
 assert.match(document,/Datei nicht verfügbar/);assert.match(document,/Archiv ist unvollständig/);assert.doesNotMatch(document,/src="https:\/\/cdn.discordapp.com\/attachments/);
});
test('SQLite/admin API: non-admin denied; activation needs archival and a private connection; save refreshes caches',sqlite,async t=>{
 const f=await fixture(t),app=require('fastify')();t.after(()=>app.close());
 const authenticate=async req=>{req.user={id:'admin'}},isAdmin=async(req,reply)=>{if(req.headers['x-test-admin']!=='yes')return reply.code(403).send({error:'Forbidden'})};
 app.decorate('authenticate',authenticate);app.decorate('isAdmin',isAdmin);
 let caches=0,syncs=0;
 f.client.tickets={getCategory:async()=>{caches++}};
 const settings=load('src/routes/api/admin/guilds/[guild]/settings.js',{'../../../../../lib/logging.js':{logAdminEvent(){}},'../../../../../lib/drive-archive':{ensureArchive:archive.ensureArchive,tick:async()=>{syncs++}}});
 const status=require('../src/routes/api/admin/guilds/[guild]/drive');
 app.route({method:'GET',url:'/api/admin/guilds/:guild/drive',config:{client:f.client},...status.get(app)});
 app.route({method:'PATCH',url:'/api/admin/guilds/:guild/settings',config:{client:f.client},...settings.patch(app)});
 assert.equal((await app.inject({url:'/api/admin/guilds/'+f.id+'/drive'})).statusCode,403);
 async function patch(payload){return app.inject({method:'PATCH',url:'/api/admin/guilds/'+f.id+'/settings',headers:{'x-test-admin':'yes'},payload})}
 assert.equal((await patch({driveArchiveEnabled:'yes'})).statusCode,400);
 await f.prisma.guild.update({where:{id:f.id},data:{archive:false,driveArchiveEnabled:false}});
 assert.equal((await patch({driveArchiveEnabled:true})).statusCode,400);
 f.adapter.failure='AUTH';assert.equal((await patch({driveArchiveEnabled:true,archive:true})).statusCode,400);
 f.adapter.failure=null;
 const response=await patch({driveArchiveEnabled:true,archive:true});assert.equal(response.statusCode,200,response.body);assert.ok(caches>0);assert.equal(syncs,1);
 assert.equal((await f.prisma.guild.findUnique({where:{id:f.id}})).driveArchiveEnabled,true);
 assert.equal((await patch({archive:false})).statusCode,200);assert.equal((await f.prisma.guild.findUnique({where:{id:f.id}})).driveArchiveEnabled,false);
});
test('transcript download keeps creator, category-support and guild access checks',()=>{
 const Command=load('src/commands/slash/transcript.js',{'../../lib/transcripts':transcripts}),allow=Command.prototype.shouldAllowAccess;
 const ticket={createdById:'creator',guildId:'guild',category:{staffRoles:['support']}};
 const interaction=(id,guildId,roleIds=[],manage=false)=>({user:{id},guild:guildId?{id:guildId}:null,client:{supers:[]},member:{id,permissions:{has:()=>manage},roles:{cache:new Discord.Collection(roleIds.map(role=>[role,{id:role}]))}}});
 assert.equal(allow.call({},interaction('creator',null),ticket),true);
 assert.equal(allow.call({},interaction('other','elsewhere',['support'],true),ticket),false);
 assert.equal(allow.call({},interaction('staff','guild',['support']),ticket),true);
 assert.equal(allow.call({},interaction('other','guild'),ticket),false);
});

test('SQLite: manual, confirmed and automatic closure keep HTML/ZIP in the transcript channel and normal logs separate',sqlite,async t=>{
 for(const kind of ['manual','confirmed','automatic']){
  const f=await fixture(t);await f.record();const logs=[],sends=[];
  const guild=f.client.guilds.cache.get(f.id);guild.iconURL=()=>null;guild.members={cache:new Discord.Collection(),fetch:async()=>({})};
  f.client.channels.cache=new Discord.Collection();
  const channel={id:'523456789012345678',guildId:f.id,type:0,guild:{premiumTier:0,members:{me:{}}},permissionsFor:()=>({has:()=>true}),messages:{fetch:async query=>typeof query==='string'?f.transcriptMessage:new Discord.Collection()},send:async payload=>{sends.push(payload);return f.transcriptMessage}};
  f.client.channels.fetch=async()=>channel;
  const Manager=load('src/lib/tickets/manager.js',{'../threads':{pools},'../stats':{},'./archiver':class {},'../ticket-presentation':{syncTicket:async()=>{},requestSync(){},participantSide:async()=> 'support'},'../logging':{logTicketEvent:async(_,event)=>logs.push(event)},'../transcripts':transcripts});
  const manager=Object.create(Manager.prototype);manager.client=f.client;manager.$count={categories:{}};manager.archiver={flush:async()=>{}};
  manager.getTicket=id=>f.prisma.ticket.findUnique({where:{id},include:{guild:true,category:true,feedback:true}});f.client.tickets=manager;
  if(kind==='confirmed'){
   await manager.scheduleClose(await manager.getTicket(f.ticket.id),{id:'request'},f.userId,'Resolved');
   await manager.acceptClose({channel:{id:f.ticket.id},guild,editReply:async()=>{}});
  }else if(kind==='automatic'){
   const deadline=new Date(Date.now()-1);await f.prisma.ticket.update({where:{id:f.ticket.id},data:{closeScheduledAt:deadline}});await manager.finallyClose(f.ticket.id,{expectedCloseAt:deadline});
  }else await manager.finallyClose(f.ticket.id,{closedBy:f.userId,reason:'Resolved'});
  await archive.processArchive(f.client,f.ticket.id);await archive.tick(f.client);
  assert.equal((await f.full()).open,false);assert.equal(sends.length,1);assert.match(sends[0].files[0].name,/\.html$/);
  assert.ok(f.transcriptMessage.payload.files.some(file=>/\.zip$/.test(file.name)));
  assert.equal(logs.length,1);assert.equal(logs[0].payload.files,undefined);assert.equal(logs[0].payload.components,undefined);
 }
});
