const fs = require('node:fs');
const { createHash } = require('node:crypto');
const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionsBitField,
} = require('discord.js');
const {
	participantSide, isCategoryStaff, channelName,
} = require('./ticket-presentation');
const { exclusive } = require('./ticket-actions');
const { getSupportMessages } = require('./support-texts');
const {
	markClosed, spool,
} = require('./drive-archive');
const jobs = new WeakMap();

async function validateClosedTicketCategory(client, guildId, categoryId) {
	if (categoryId === null || categoryId === undefined) return null;
	if (typeof categoryId !== 'string' || !/^\d{17,20}$/.test(categoryId)) throw new Error('Bitte eine Discord-Kategorie für geschlossene Tickets auswählen.');
	const category = await client.channels.fetch(categoryId);
	if (!category || category.guildId !== guildId || category.type !== ChannelType.GuildCategory) throw new Error('Bitte eine Discord-Kategorie dieses Servers auswählen.');
	const member = category.guild.members.me || await category.guild.members.fetchMe();
	for (const permission of ['ViewChannel', 'ManageChannels']) {
		if (!category.permissionsFor(member)?.has(PermissionsBitField.Flags[permission])) throw new Error(`In der Kategorie für geschlossene Tickets fehlt dem Bot ${permission}.`);
	}
	return category;
}

async function placeClosedChannel(client, ticket, channel) {
	const category = await validateClosedTicketCategory(client, ticket.guildId, ticket.guild.closedTicketCategory);
	const name = channelName(ticket);
	const changes = {};
	if (channel.name !== name) changes.name = name;
	if (category && channel.parentId !== category.id) {
		changes.parent = category.id;
		// Keep participant denies, assigned staff access and category-specific staff roles.
		changes.lockPermissions = false;
	}
	if (Object.keys(changes).length) {
		await channel.edit({
			...changes,
			reason: 'Ticket closed; staff workspace retained',
		});
	}
}

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
		const flags = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages];
		if (hide ? current?.deny.has(flags) : current?.allow.has(PermissionsBitField.Flags.SendMessages)) return;
		await overwrites.edit(id, {
			...(hide ? { ViewChannel: false } : {}),
			SendMessages: !hide,
		}, 'Ticket closed; staff workspace retained');
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

async function closedControls(client, ticket, channel) {
	const getMessage = await getSupportMessages(client, { ticketId: ticket.id });
	const archived = ticket.guild.archive && process.env.OVERRIDE_ARCHIVE !== 'false';
	const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
		.setCustomId(JSON.stringify({
			action: 'delete',
			ticket: ticket.id,
		}))
		.setLabel(getMessage('buttons.delete.text')).setEmoji('🗑️').setStyle(ButtonStyle.Danger));
	if (archived) {
		row.addComponents(new ButtonBuilder()
			.setCustomId(JSON.stringify({
				action: 'transcript',
				ticket: ticket.id,
			}))
			.setLabel(getMessage('buttons.transcript.text')).setEmoji(getMessage('buttons.transcript.emoji')).setStyle(ButtonStyle.Secondary));
	}
	// Old close/claim/edit buttons must not grant access or start a second closure.
	if (ticket.openingMessageId) {
		try {
			const opening = await channel.messages.fetch(ticket.openingMessageId);
			if (opening?.components?.length) await opening.edit({ components: [] });
		} catch (error) {
			if (error.code !== 10008) throw error;
		}
	}
	if (ticket.closedControlMessageId) {
		try {
			await channel.messages.fetch(ticket.closedControlMessageId);
			return;
		} catch (error) {
			if (error.code !== 10008) throw error;
		}
	}
	const footer = 'closed:' + ticket.id;
	const recent = await channel.messages.fetch({ limit: 100 });
	let sent = recent.find(message => message.author?.id === client.user.id && message.embeds?.some(embed => embed.footer?.text === footer));
	if (!sent) {
		sent = await channel.send({
			embeds: [new EmbedBuilder().setColor(ticket.guild.successColour).setTitle(getMessage('ticket.close.closed.title'))
				.setDescription(getMessage('ticket.close.' + (archived ? 'retained' : 'retained_no_archive'))).setFooter({ text: footer })],
			components: [row],
			allowedMentions: { parse: [] },
			nonce: createHash('sha256').update('closed-controls:' + ticket.id).digest('hex').slice(0, 24),
			enforceNonce: true,
		});
	}
	await client.prisma.ticket.update({
		where: { id: ticket.id },
		data: { closedControlMessageId: sent.id },
	});
}

async function finishNow(client, id) {
	let ticket = await client.prisma.ticket.findUnique({
		where: { id },
		include: {
			guild: true,
			category: true,
		},
	});
	if (!ticket || ticket.open || !(ticket.closeChannelPending || ticket.closeCapturePending || ticket.channelDeletePending)) return;
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
		if (channel?.guildId && channel.guildId !== ticket.guildId) throw Object.assign(new Error('Wrong ticket guild'), { code: 'PERMISSION' });
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
		if (channel && ticket.closeChannelPending && !ticket.channelDeletePending) {
			await closedControls(client, ticket, channel);
			await placeClosedChannel(client, ticket, channel);
		}
		ticket = await client.prisma.ticket.update({
			where: { id },
			data: {
				closeChannelPending: false,
				...(channel ? {} : {
					deleted: true,
					channelDeletePending: false,
				}),
			},
			include: {
				guild: true,
				category: true,
			},
		});
		// Closing never requests deletion. Only the separate Delete action does.
		if (!ticket.channelDeletePending) {
			await client.prisma.ticket.update({
				where: { id },
				data: {
					channelDeleteNextAttemptAt: null,
					channelDeleteAttempts: 0,
				},
			});
			return;
		}
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
				deleted: true,
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
		client.log.warn('Ticket #%d: close/delete will be retried (%s)', ticket.number, error.code || error.name);
	}
}

function finishCloseChannel(client, id) {
	if (!jobs.has(client)) jobs.set(client, new Map());
	const active = jobs.get(client);
	if (!active.has(id)) active.set(id, exclusive(client, id, () => finishNow(client, id)).finally(() => active.delete(id)));
	return active.get(id);
}

async function finishPendingCloseChannels(client) {
	const tickets = await client.prisma.ticket.findMany({
		where: {
			open: false,
			AND: [
				{ OR: [{ closeChannelPending: true }, { closeCapturePending: true }, { channelDeletePending: true }] },
				{ OR: [{ channelDeleteNextAttemptAt: null }, { channelDeleteNextAttemptAt: { lte: new Date() } }] },
			],
		},
		select: { id: true },
		take: 50,
	});
	for (let index = 0; index < tickets.length; index += 2) await Promise.allSettled(tickets.slice(index, index + 2).map(ticket => finishCloseChannel(client, ticket.id)));
}

async function requestDelete(client, {
	guildId, ticketId, actorId,
}) {
	await exclusive(client, ticketId, async () => {
		const ticket = await client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include: {
				guild: true,
				category: true,
			},
		});
		const fail = code => {
			throw Object.assign(new Error(code), { deleteCode: code });
		};
		if (!ticket || ticket.guildId !== guildId) fail('missing');
		const guild = client.guilds.cache.get(guildId);
		if (!guild || !await isCategoryStaff(client, guild, ticket.category, actorId)) fail('forbidden');
		if (ticket.open) fail('open');
		if (ticket.deleted) fail('deleted');
		await client.prisma.ticket.updateMany({
			where: {
				id: ticketId,
				guildId,
				open: false,
				deleted: false,
				channelDeletePending: false,
			},
			data: {
				channelDeletePending: true,
				channelDeleteNextAttemptAt: null,
				channelDeleteAttempts: 0,
			},
		});
	});
}

module.exports = {
	validateClosedTicketCategory,
	finishCloseChannel,
	finishPendingCloseChannels,
	pinnedIds,
	requestDelete,
};
