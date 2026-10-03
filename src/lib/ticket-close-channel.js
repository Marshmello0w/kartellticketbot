const fs = require('node:fs');
const { PermissionsBitField } = require('discord.js');
const { participantSide } = require('./ticket-presentation');
const {
	markClosed, spool,
} = require('./drive-archive');
const jobs = new WeakMap();

async function pinnedIds(messages) {
	if (!messages.fetchPins) return [...(await messages.fetchPinned()).keys()];
	const ids = new Set();
	let before;
	while (true) {
		const page = await messages.fetchPins({
			limit: 50,
			cache: false,
			...(before ? { before } : {}),
		});
		for (const pin of page.items) ids.add(pin.message.id);
		const next = page.items.at(-1)?.pinnedAt;
		if (!page.hasMore || !next || +next === +before) break;
		before = next;
	}
	return [...ids];
}

async function hideParticipants(client, ticket, channel) {
	const overwrites = channel.permissionOverwrites;
	const botRoles = channel.guild.members.me?.roles?.cache;
	const deny = async (id, hide) => {
		const current = overwrites.cache.get(id);
		const flags = hide ? [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] : [PermissionsBitField.Flags.SendMessages];
		if (current?.deny.has(flags)) return;
		await overwrites.edit(id, {
			...(hide ? { ViewChannel: false } : {}),
			SendMessages: false,
		}, 'Ticket closed; securing archive');
	};
	// Deny other role access too, while preserving category staff and bot visibility.
	for (const overwrite of overwrites.cache.values()) {
		if (overwrite.id === client.user.id || overwrite.type === 0 && overwrite.id !== channel.guild.id && botRoles?.has(overwrite.id)) continue;
		if (overwrite.type === 0) await deny(overwrite.id, !ticket.category?.staffRoles.includes(overwrite.id));
		else await deny(overwrite.id, await participantSide(client, ticket, overwrite.id) === 'USER');
	}
	if (channel.guild.id) await deny(channel.guild.id, true);
	if (ticket.createdById !== client.user.id) await deny(ticket.createdById, true);
}

async function finishNow(client, id) {
	let ticket = await client.prisma.ticket.findUnique({
		where: { id },
		include: {
			guild: true,
			category: true,
		},
	});
	if (!ticket || ticket.open || !ticket.channelDeletePending) return;
	if (ticket.channelDeleteNextAttemptAt && ticket.channelDeleteNextAttemptAt > new Date()) return;
	try {
		let channel = client.channels.cache.get(id);
		if (!channel) {
			try {
				channel = await client.channels.fetch(id);
			} catch (error) {
				if (error.code !== 10003) throw error;
			}
		}
		if (channel && channel.id !== id) throw Object.assign(new Error('Wrong ticket channel'), { code: 'PERMISSION' });
		if (channel) {
			await hideParticipants(client, ticket, channel);
		}
		if (ticket.closeCapturePending) {
			const captured = await client.tickets.archiver.prepareClose(id);
			if (!captured && channel) throw Object.assign(new Error('Final message capture failed'), { code: 'SOURCE' });
			await client.tickets.archiver.flush?.(id);
			const count = await client.prisma.archivedMessage.count({ where: { ticketId: id } });
			ticket = await client.prisma.ticket.update({
				where: { id },
				data: {
					closeCapturePending: false,
					messageCount: count,
					...(channel ? { pinnedMessageIds: await pinnedIds(channel.messages) } : {}),
				},
				include: {
					guild: true,
					category: true,
				},
			});
		}
		if (client.prisma.driveArchive) await markClosed(client, ticket);
		const pending = await client.prisma.driveAsset.findMany({
			where: {
				archiveId: id,
				state: 'pending',
			},
			select: {
				localReady: true,
				relativePath: true,
			},
		});
		if (pending.some(asset => !asset.localReady || !fs.existsSync(spool(id, asset.relativePath)))) {
			await client.prisma.ticket.update({
				where: { id },
				data: { channelDeleteNextAttemptAt: new Date(Date.now() + 30000) },
			});
			return;
		}
		if (channel) {
			if (!channel.deletable) throw Object.assign(new Error('Ticket channel cannot be deleted'), { code: 'PERMISSION' });
			await channel.delete('Ticket closed; archive sources secured');
		}
		await client.prisma.ticket.update({
			where: { id },
			data: {
				channelDeletePending: false,
				channelDeleteNextAttemptAt: null,
				channelDeleteAttempts: 0,
			},
		});
	} catch (error) {
		const attempts = ticket.channelDeleteAttempts + 1;
		await client.prisma.ticket.update({
			where: { id },
			data: {
				channelDeleteAttempts: attempts,
				channelDeleteNextAttemptAt: new Date(Date.now() + (attempts === 1 ? 60000 : attempts === 2 ? 300000 : 900000)),
			},
		});
		client.log.warn('Ticket #%d: channel retained for archive (%s)', ticket.number, error.code || error.name);
	}
}

function finishCloseChannel(client, id) {
	if (!jobs.has(client)) jobs.set(client, new Map());
	const active = jobs.get(client);
	if (!active.has(id)) active.set(id, finishNow(client, id).finally(() => active.delete(id)));
	return active.get(id);
}

async function finishPendingCloseChannels(client) {
	const tickets = await client.prisma.ticket.findMany({
		where: {
			open: false,
			channelDeletePending: true,
			OR: [{ channelDeleteNextAttemptAt: null }, { channelDeleteNextAttemptAt: { lte: new Date() } }],
		},
		select: { id: true },
		take: 50,
	});
	for (let index = 0; index < tickets.length; index += 2) await Promise.allSettled(tickets.slice(index, index + 2).map(ticket => finishCloseChannel(client, ticket.id)));
}

module.exports = {
	finishCloseChannel,
	finishPendingCloseChannels,
	pinnedIds,
};
