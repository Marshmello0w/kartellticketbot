const { PermissionsBitField } = require('discord.js');
const { logTicketEvent } = require('./logging');
const {
	include, isCategoryStaff, requestSync, stripManagedPrefix,
} = require('./ticket-presentation');
const locks = new WeakMap();
function exclusive(client, ticketId, run) {
	if (!locks.has(client)) locks.set(client, new Map());
	const map = locks.get(client), previous = map.get(ticketId) || Promise.resolve();
	const next = previous.catch(() => {}).then(run);
	map.set(ticketId, next);
	return next.finally(() => {
		if (map.get(ticketId) === next) map.delete(ticketId);
	});
}
const fail = key => {
	const error = new Error(key);
	error.supportKey = `ticket.support.errors.${key}`;
	throw error;
};
async function context(client, guildId, ticketId, actorId, allowCreator = false, allowRetained = false) {
	const ticket = await client.prisma.ticket.findUnique({
		where: { id: ticketId },
		include,
	});
	if (!ticket || !ticket.open && !allowRetained || ticket.deleted || ticket.channelDeletePending || ticket.guildId !== guildId || !ticket.category) fail('closed');
	const guild = client.guilds.cache.get(guildId);
	const creator = allowCreator && ticket.createdById === actorId;
	if (!guild || !creator && !await isCategoryStaff(client, guild, ticket.category, actorId)) fail('forbidden');
	const actor = guild.members.cache.get(actorId) || await guild.members.fetch(actorId);
	const admin = client.supers?.includes(actorId) || actor.permissions.has(PermissionsBitField.Flags.ManageGuild);
	if (ticket.claimedById && ticket.claimedById !== actorId && !admin && !creator) fail('assigned');
	const channel = await client.channels.fetch(ticketId);
	if (!channel) fail('closed');
	return {
		ticket,
		guild,
		channel,
		actor,
		admin,
	};
}
function categoryBaseName(category, member, number) {
	return category.channelName.replace(/{+\s?(user)?name\s?}+/gi, member.user.username).replace(/{+\s?(nick|display)(name)?\s?}+/gi, member.displayName).replace(/{+\s?num(ber)?\s?}+/gi, number === 1488 ? '1487b' : number);
}
async function performAction(client, {
	guildId, ticketId, actorId, action, value, automatic = false,
}) {
	return exclusive(client, ticketId, async () => {
		const {
			ticket, guild, channel, actor, admin,
		} = await context(client, guildId, ticketId, actorId, action === 'transfer', ['rename', 'priority'].includes(action));
		if (automatic && (action !== 'claim' || ticket.createdById === actorId || ticket.claimedById)) return null;
		const original = {}, updated = {};
		// Team actions permanently end automated triage for this ticket.
		await client.prisma.ticket.updateMany({
			where: {
				id: ticketId,
				open: true,
			},
			data: { aiState: 'human' },
		});
		if (['claim', 'release', 'handoff'].includes(action)) {
			if (action === 'claim' && ticket.claimedById) fail('assigned');
			if (action !== 'claim' && (!ticket.claimedById || ticket.claimedById !== actorId && !admin)) fail('assigned');
			const targetId = action === 'release' ? null : action === 'claim' ? actorId : value;
			if (targetId === ticket.claimedById) fail('assigned');
			if (targetId) {
				const target = await guild.members.fetch(targetId).catch(() => null);
				if (!target || target.user.bot || !await isCategoryStaff(client, guild, ticket.category, targetId)) fail('target');
				await client.prisma.user.upsert({
					where: { id: targetId },
					create: { id: targetId },
					update: {},
				});
			}
			const snapshots = [...channel.permissionOverwrites.cache.values()].map(overwrite => ({
				id: overwrite.id,
				type: overwrite.type,
				allow: overwrite.allow.bitfield,
				deny: overwrite.deny.bitfield,
			}));
			const claimed = await client.prisma.ticket.updateMany({
				where: {
					id: ticketId,
					open: true,
					deleted: false,
					channelDeletePending: false,
					categoryId: ticket.categoryId,
					createdById: ticket.createdById,
					claimedById: ticket.claimedById,
				},
				data: {
					claimedById: targetId,
					aiState: 'human',
				},
			});
			if (!claimed.count) fail('changed');
			try {
				if (targetId) await channel.permissionOverwrites.edit(targetId, { ViewChannel: true }, 'Ticket assignment');
				for (const role of ticket.category.staffRoles) await channel.permissionOverwrites.edit(role, { ViewChannel: !targetId }, 'Ticket assignment');
				if (ticket.claimedById && ticket.claimedById !== ticket.createdById) await channel.permissionOverwrites.delete(ticket.claimedById, 'Ticket assignment released');
			} catch (error) {
				await channel.permissionOverwrites.set(snapshots).catch(client.log.error);
				await client.prisma.ticket.updateMany({
					where: {
						id: ticketId,
						open: true,
						claimedById: targetId,
					},
					data: { claimedById: ticket.claimedById },
				});
				throw error;
			}
			original.claimedById = ticket.claimedById;
			updated.claimedById = targetId;
		} else if (action === 'transfer') {
			const member = await guild.members.fetch(value).catch(() => null);
			if (!member || member.user.bot || member.id === ticket.createdById) fail('target');
			const snapshots = [...channel.permissionOverwrites.cache.values()].map(overwrite => ({
				id: overwrite.id,
				type: overwrite.type,
				allow: overwrite.allow.bitfield,
				deny: overwrite.deny.bitfield,
			}));
			const topic = channel.topic;
			await client.prisma.user.upsert({
				where: { id: member.id },
				create: { id: member.id },
				update: {},
			});
			try {
				await channel.permissionOverwrites.edit(member.id, {
					ViewChannel: true,
					ReadMessageHistory: true,
					SendMessages: true,
					EmbedLinks: true,
					AttachFiles: true,
				});
				const description = ticket.topic ? await require('./threads').pools.crypto.queue(worker => worker.decrypt(ticket.topic)) : '';
				await channel.edit({ topic: `<@${member.id}>${description ? ` | ${description}` : ''}` });
				const result = await client.prisma.ticket.updateMany({
					where: {
						id: ticketId,
						open: true,
						createdById: ticket.createdById,
					},
					data: {
						createdById: member.id,
						channelBaseName: categoryBaseName(ticket.category, member, ticket.number),
					},
				});
				if (!result.count) fail('changed');
			} catch (error) {
				await channel.edit({
					topic,
					permissionOverwrites: snapshots,
				}).catch(client.log.error);
				throw error;
			}
			const counters = client.tickets.$count.categories[ticket.categoryId] ||= {};
			delete counters[ticket.createdById];
			delete counters[member.id];
			original.createdById = ticket.createdById;
			updated.createdById = member.id;
		} else if (action === 'priority' || action === 'rename') {
			if (action === 'priority' && !['HIGH', 'MEDIUM', 'LOW'].includes(value)) fail('invalid');
			if (action === 'rename' && (typeof value !== 'string' || !value.trim() || Array.from(value).length > 100)) fail('invalid');
			const field = action === 'priority' ? 'priority' : 'channelBaseName';
			const name = action === 'rename' ? stripManagedPrefix(value.trim(), ticket.priority) : ticket.channelBaseName || stripManagedPrefix(channel.name, ticket.priority);
			const result = await client.prisma.ticket.updateMany({
				where: {
					id: ticketId,
					open: ticket.open,
					deleted: false,
					channelDeletePending: false,
				},
				data: {
					[field]: action === 'priority' ? value : name,
					...(action === 'priority' ? { channelBaseName: name } : {}),
				},
			});
			if (!result.count) fail('closed');
			original[field] = ticket[field];
			updated[field] = action === 'priority' ? value : name;
		} else if (action === 'move') {
			const category = await client.prisma.category.findUnique({ where: { id: Number(value) } });
			if (!category || category.guildId !== guildId || !await isCategoryStaff(client, guild, category, actorId)) fail('category');
			if (category.id === ticket.categoryId) fail('category');
			const parent = await guild.channels.fetch(category.discordCategory);
			if (!parent || parent.children.cache.size >= 50) fail('full');
			const creator = await guild.members.fetch(ticket.createdById);
			const claimedById = ticket.claimedById && await isCategoryStaff(client, guild, category, ticket.claimedById) ? ticket.claimedById : null;
			const base = categoryBaseName(category, creator, ticket.number);
			const snapshot = {
				parent: channel.parentId,
				permissionOverwrites: [...channel.permissionOverwrites.cache.values()].map(overwrite => ({
					id: overwrite.id,
					type: overwrite.type,
					allow: overwrite.allow.bitfield,
					deny: overwrite.deny.bitfield,
				})),
			};
			const allow = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'];
			const overwrites = new Map(snapshot.permissionOverwrites.filter(item => item.type === 1 && ![ticket.claimedById, client.user.id, ticket.createdById].includes(item.id)).map(item => [item.id, item]));
			overwrites.set(guild.roles.everyone.id, {
				id: guild.roles.everyone.id,
				deny: ['ViewChannel'],
			});
			for (const id of [client.user.id, ticket.createdById]) {
				overwrites.set(id, {
					id,
					allow,
				});
			}
			for (const id of category.staffRoles) {
				overwrites.set(id, claimedById ? {
					id,
					deny: ['ViewChannel'],
				} : {
					id,
					allow,
				});
			}
			if (claimedById) {
				overwrites.set(claimedById, {
					id: claimedById,
					allow,
				});
			}
			await channel.edit({
				parent: parent.id,
				lockPermissions: false,
				permissionOverwrites: [...overwrites.values()],
			});
			let result;
			try {
				result = await client.prisma.ticket.updateMany({
					where: {
						id: ticketId,
						open: true,
						categoryId: ticket.categoryId,
					},
					data: {
						categoryId: category.id,
						channelBaseName: base,
						claimedById,
					},
				});
				if (!result.count) {
					fail('changed');
				}
			} catch (error) {
				await channel.edit(snapshot).catch(client.log.error);
				throw error;
			}
			const counters = client.tickets.$count.categories;
			for (const id of [ticket.categoryId, category.id]) {
				counters[id] ||= {};
				delete counters[id].total;
				delete counters[id][ticket.createdById];
			}
			original.categoryId = ticket.categoryId;
			updated.categoryId = category.id;
		} else {
			fail('invalid');
		}
		requestSync(client, ticketId);
		await logTicketEvent(client, {
			action: action === 'claim' ? 'claim' : action === 'release' ? 'unclaim' : 'update',
			diff: {
				original,
				updated,
			},
			target: {
				id: ticketId,
				name: `<#${ticketId}>`,
			},
			userId: actor.id,
		}).catch(client.log.error);
		return client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include,
		});
	});
}
async function claimOnReply(client, message) {
	const guildId = message.guildId || message.guild?.id;
	const ticketId = message.channelId || message.channel?.id;
	if (!guildId || !ticketId || !message.author || message.author.bot || message.webhookId || message.system || !message.content?.trim() && !message.attachments?.size) return false;
	try {
		// Enter the same per-ticket queue immediately, preserving gateway arrival
		// order and competing safely with explicit Claim, Release and Handoff.
		const ticket = await performAction(client, {
			guildId,
			ticketId,
			actorId: message.author.id,
			action: 'claim',
			automatic: true,
		});
		return Boolean(ticket);
	} catch (error) {
		if (['closed', 'forbidden', 'assigned', 'changed', 'target'].some(key => error.supportKey === 'ticket.support.errors.' + key)) return false;
		throw error;
	}
}
module.exports = {
	categoryBaseName,
	context,
	exclusive,
	performAction,
	claimOnReply,
};
