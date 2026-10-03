const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const D = require('discord.js');
const I18n = require('@eartharoid/i18n');
const YAML = require('yaml');
const presentation = require('../../src/lib/ticket-presentation');
const i18n = new I18n('en-GB', Object.fromEntries(['en-GB','de'].map(locale => [locale, YAML.parse(fs.readFileSync(path.join(__dirname, `../../src/i18n/${locale}.yml`), 'utf8'))])));
function load(file, replacements = {}) {
 const absolute = path.join(__dirname, '../..', file), requireFile = createRequire(absolute), module = { exports: {} };
 vm.runInNewContext(fs.readFileSync(absolute, 'utf8'), { module, Date, Buffer, process, setTimeout, clearTimeout, require: name => replacements[name] || requireFile(name) });
 return module.exports;
}
const actions = load('src/lib/ticket-actions.js', { './logging': { logTicketEvent: async () => {} } });
const ui = load('src/lib/ticket-support-ui.js', { './ticket-actions': actions });
let serial = 0;
async function fixture(t) {
 const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
 db.$use(require('../../src/lib/middleware/prisma-sqlite'));
 const guildId = String(BigInt(Date.now()) * 100000n + BigInt(++serial * 100)), botId = guildId + '9';
 const ids = { creator: guildId + '1', staff: guildId + '2', next: guildId + '3', admin: guildId + '4', user: guildId + '5', outsider: guildId + '6' };
 const roles = { de: guildId + '7', en: guildId + '8' };
 const members = new D.Collection();
 for (const [name,id] of Object.entries(ids)) members.set(id, { id, displayName: name, user: { id, username: name, bot: false }, roles: { cache: new D.Collection(name === 'staff' || name === 'next' ? [[roles.de,{}]] : []) }, permissions: new D.PermissionsBitField(name === 'admin' ? [D.PermissionFlagsBits.ManageGuild] : []), send: async () => {} });
 const guild = { id: guildId, name: 'Support', iconURL: () => null, roles: { everyone: { id: guildId } }, members: { cache: members, me: { id: botId }, fetch: async id => { if (!members.has(id)) throw Object.assign(new Error('Unknown member'), { code: 10007 }); return members.get(id); } } };
 const channels = new D.Collection(), errors = [];
 const client = { prisma: db, i18n, user: { id: botId }, supers: [], guilds: { cache: new D.Collection([[guildId,guild]]) }, channels: { cache: channels, fetch: async id => { if (!channels.has(id)) throw Object.assign(new Error('Unknown channel'), { code: 10003 }); return channels.get(id); } }, log: { error: error => errors.push(error), warn() {} }, tickets: { $count: { categories: {} }, getCategory: async () => {} } };
 guild.channels = client.channels;
 let messageSerial = 1000n;
 function channel(id, name = 'ticket-042') {
  const cache = new D.Collection();
  const result = { id, name, guildId, guild, type: D.ChannelType.GuildText, private: true, canSend: true, topic: null, parentId: guildId + 'parent', edits: 0, sent: 0, renameCalls: [], children: { cache: new D.Collection() }, deletable: true };
  result.permissionsFor = who => new D.PermissionsBitField(who.id === guildId ? result.private ? [] : [D.PermissionFlagsBits.ViewChannel] : result.canSend ? ['ViewChannel','ReadMessageHistory','SendMessages','EmbedLinks','AttachFiles'] : []);
  result.messages = { cache, fetch: async query => {
   if (typeof query === 'string') { if (!cache.has(query)) throw Object.assign(new Error('Unknown message'), { code: 10008 }); return cache.get(query); }
   return new D.Collection([...cache].filter(([id]) => !query.before || BigInt(id) < BigInt(query.before)).sort((a,b) => BigInt(a[0]) > BigInt(b[0]) ? -1 : 1).slice(0,query.limit));
  }, delete: async id => { if (result.failDelete) throw new Error('Deletion unavailable'); if (!cache.delete(id)) throw Object.assign(new Error('Unknown message'), { code: 10008 }); }, fetchPinned: async () => new D.Collection() };
  result.add = (payload, author = { id: botId, bot: true }, at = new Date(), flags = {}) => {
   const id = String(BigInt(guildId) * 10000n + ++messageSerial);
   const message = { id, createdAt: at, author, system: false, webhookId: null, embeds: [], components: [], ...flags };
   function apply(payload) { if (payload.content !== undefined) message.content = payload.content; if (payload.flags !== undefined) message.flags = payload.flags; if (payload.embeds) message.embeds = payload.embeds.map(embed => new D.EmbedBuilder(embed.toJSON ? embed.toJSON() : embed)); if (payload.components) message.components = payload.components.map(row => D.ActionRowBuilder.from(row)); message.allowedMentions = payload.allowedMentions; }
   apply(payload); message.edit = async payload => { result.edits++; apply(payload); return message; }; message.delete = () => result.messages.delete(id); cache.set(id,message); return message;
  };
  result.send = async payload => { result.sent++; return result.add(payload); };
  result.setName = async name => { result.renameCalls.push(name); if (result.renameGate) await result.renameGate; result.name = name; return result; };
  const overwrites = new D.Collection();
  const put = item => overwrites.set(item.id, { id: item.id, type: item.type ?? (members.has(item.id) || item.id === botId ? 1 : 0), allow: new D.PermissionsBitField(item.allow || []), deny: new D.PermissionsBitField(item.deny || []) });
  result.permissionOverwrites = { cache: overwrites, edit: async (id, values) => { if (result.failPermissions) throw new Error('Permissions unavailable'); id = id.id || id; const previous = overwrites.get(id); const allow = new D.PermissionsBitField(previous?.allow.bitfield || 0n), deny = new D.PermissionsBitField(previous?.deny.bitfield || 0n); for (const [flag,enabled] of Object.entries(values)) { if (enabled) { allow.add(flag); deny.remove(flag); } else { deny.add(flag); allow.remove(flag); } } put({ id, allow, deny }); }, delete: async id => overwrites.delete(id), set: async values => { overwrites.clear(); values.forEach(put); } };
  result.edit = async value => { if (value.permissionOverwrites) await result.permissionOverwrites.set(value.permissionOverwrites); if (value.parent !== undefined) result.parentId = value.parent; if (value.topic !== undefined) result.topic = value.topic; return result; };
  result.delete = async () => channels.delete(id);
  channels.set(id,result); return result;
 }
 await db.guild.create({ data: { id: guildId, locale: 'de', archive: false } });
 await db.user.createMany({ data: Object.values(ids).map(id => ({ id })) });
 const categoryData = { guildId, channelName: 'ticket-{number}', description: 'Support', discordCategory: guildId + 'parent', emoji: '🎫', openingMessage: 'Hi', staffRoles: [roles.de] };
 const de = await db.category.create({ data: { ...categoryData, name: 'Deutsch', textOverrides: { 'buttons.support.text': 'Team-Aktionen', 'ticket.support.overview.unassigned': 'Noch frei' } } });
 const en = await db.category.create({ data: { ...categoryData, name: 'English', staffRoles: [roles.en], textOverrides: { 'buttons.support.text': 'Staff actions', 'ticket.support.overview.unassigned': 'Unclaimed', 'menus.support.placeholder': 'Choose action' } } });
 const overview = channel(guildId + '0','overview');
 await db.guild.update({ where: { id: guildId }, data: { ticketOverviewChannel: overview.id } });
 let number = 0;
 async function create(data = {}) {
  number++; const ticketChannel = channel(guildId + String(number + 20));
  const opening = ticketChannel.add({ embeds: [new D.EmbedBuilder().setTitle('Welcome')] });
  const ticket = await db.ticket.create({ data: { id: ticketChannel.id, guildId, categoryId: de.id, createdById: ids.creator, number, openingMessageId: opening.id, createdAt: new Date(Date.now() - 600000), channelBaseName: 'ticket-042', ...data } });
  client.tickets.$count.categories[ticket.categoryId] ||= { total: 0, [ids.creator]: 0 }; client.tickets.$count.categories[ticket.categoryId].total++; client.tickets.$count.categories[ticket.categoryId][ids.creator]++;
  return { ticket, channel: ticketChannel, opening };
 }
 t.after(async () => { await presentation.stopPresentations(client); await db.guild.delete({ where: { id: guildId } }); await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } }); await db.$disconnect(); });
 return { db, client, guild, guildId, ids, roles, members, de, en, overview, errors, create, channel, read: id => db.ticket.findUnique({ where: { id }, include: presentation.include }) };
}
module.exports = { fixture, load, actions, ui, presentation, i18n, D };
