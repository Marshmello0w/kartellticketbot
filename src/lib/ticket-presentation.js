const {
	ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionsBitField,
} = require('discord.js');
const { getSupportMessages } = require('./support-texts');

const WAIT_MS = 5 * 60 * 1000;
const PRIORITY = {
	HIGH: '🔴',
	MEDIUM: '🟠',
	LOW: '🟢',
};
const WAIT_EMOJI = {
	STAFF: '🛠️',
	USER: '👤',
	ACTIVE: '',
};
const include = {
	guild: true,
	category: true,
	_count: { select: { questionAnswers: true } },
};
const sessions = new WeakMap();
function session(client) {
	if (!sessions.has(client)) {
		sessions.set(client, {
			jobs: new Map(),
			names: new Map(),
			timers: new Map(),
			history: new Set(),
			recoveredAt: new Map(),
		});
	}
	return sessions.get(client);
}

async function isCategoryStaff(client, guild, category, userId) {
	if (client.supers?.includes(userId)) return true;
	const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
	return Boolean(member && (member.permissions.has(PermissionsBitField.Flags.ManageGuild) || category?.staffRoles?.some(id => member.roles.cache.has(id))));
}
async function participantSide(client, ticket, userId) {
	if (userId === ticket.createdById) return 'USER';
	const guild = client.guilds.cache.get(ticket.guildId);
	return guild && await isCategoryStaff(client, guild, ticket.category, userId) ? 'STAFF' : 'USER';
}
function waitingState(ticket, now = Date.now()) {
	let at = ticket.lastParticipantAt || ticket.createdAt;
	let side = ticket.lastParticipantSide || 'USER';
	if (ticket.closeRequestedAt && ticket.closeRequestedById && (!at || +ticket.closeRequestedAt >= +at)) {
		const sameActivity = at && +ticket.closeRequestedAt === +at && ticket.lastParticipantSide;
		at = ticket.closeRequestedAt;
		side = sameActivity ? ticket.lastParticipantSide : ticket.closeRequestedById === ticket.createdById ? 'USER' : 'STAFF';
	}
	if (now - +at < WAIT_MS) return 'ACTIVE';
	return side === 'STAFF' ? 'USER' : 'STAFF';
}
function stripManagedPrefix(name) {
	let base = name;
	const managed = [...Object.values(PRIORITY), '🛠️', '🛠', '👤'];
	let prefix;
	while ((prefix = managed.find(emoji => base.startsWith(emoji)))) base = base.slice(prefix.length);
	return base || 'ticket';
}
function channelName(ticket, now = Date.now()) {
	const status = ticket.guild.automaticTicketStatus === false ? '' : WAIT_EMOJI[waitingState(ticket, now)];
	const prefix = (PRIORITY[ticket.priority] || '') + status;
	const base = ticket.channelBaseName || 'ticket-' + ticket.number;
	return prefix + Array.from(base).slice(0, 100 - Array.from(prefix).length).join('');
}
function openingRows(ticket, getMessage) {
	const row = new ActionRowBuilder();
	if (ticket.topic || ticket._count?.questionAnswers) row.addComponents(new ButtonBuilder().setCustomId(JSON.stringify({ action: 'edit' })).setStyle(ButtonStyle.Secondary).setEmoji(getMessage('buttons.edit.emoji')).setLabel(getMessage('buttons.edit.text')));
	if (ticket.guild.claimButton && ticket.category?.claiming) row.addComponents(new ButtonBuilder().setCustomId(JSON.stringify({ action: ticket.claimedById ? 'unclaim' : 'claim' })).setStyle(ButtonStyle.Secondary).setEmoji(getMessage(`buttons.${ticket.claimedById ? 'unclaim' : 'claim'}.emoji`)).setLabel(getMessage(`buttons.${ticket.claimedById ? 'unclaim' : 'claim'}.text`)));
	if (ticket.guild.closeButton) row.addComponents(new ButtonBuilder().setCustomId(JSON.stringify({ action: 'close' })).setStyle(ButtonStyle.Danger).setEmoji(getMessage('buttons.close.emoji')).setLabel(getMessage('buttons.close.text')));
	row.addComponents(new ButtonBuilder().setCustomId(JSON.stringify({
		action: 'support',
		ticket: ticket.id,
	})).setStyle(ButtonStyle.Secondary).setEmoji('🛠️').setLabel(getMessage('buttons.support.text')));
	return [row];
}
function deadlineField(ticket, getMessage) {
	if (!ticket.closeScheduledAt) return null;
	const timestamp = Math.floor(+ticket.closeScheduledAt / 1000);
	return {
		name: getMessage('ticket.support.deadline.name').slice(0, 256),
		value: getMessage('ticket.support.deadline.value', {
			absolute: `<t:${timestamp}:F>`,
			relative: `<t:${timestamp}:R>`,
		}).slice(0, 1024),
	};
}
async function validateOverviewChannel(client, guildId, channelId, logChannel, transcriptChannel) {
	if (!channelId) return null;
	if (typeof channelId !== 'string' || !/^\d{17,20}$/.test(channelId) || [logChannel, transcriptChannel].includes(channelId)) throw new Error('Übersicht, Log und Transkript benötigen unterschiedliche Kanäle.');
	const channel = await client.channels.fetch(channelId);
	if (!channel || channel.guildId !== guildId || channel.type !== ChannelType.GuildText) throw new Error('Bitte einen Textkanal dieses Servers auswählen.');
	if (channel.permissionsFor(channel.guild.roles.everyone)?.has(PermissionsBitField.Flags.ViewChannel)) throw new Error('Der Übersichtskanal muss vor @everyone geschützt sein.');
	const member = channel.guild.members.me || await channel.guild.members.fetchMe();
	for (const permission of ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks']) if (!channel.permissionsFor(member)?.has(PermissionsBitField.Flags[permission])) throw new Error(`Im Übersichtskanal fehlt dem Bot ${permission}.`);
	return channel;
}
const gone = error => [10003, 10008].includes(error.code);
async function removeOverview(client, ticket) {
	if (!ticket.overviewMessageId) return;
	try {
		const channel = await client.channels.fetch(ticket.overviewChannelId);
		if (channel) await channel.messages.delete(ticket.overviewMessageId);
	} catch (error) {
		if (!gone(error)) throw error;
	}
	await client.prisma.ticket.update({
		where: { id: ticket.id },
		data: {
			overviewChannelId: null,
			overviewMessageId: null,
		},
	});
}
function overviewURL(ticket) {
	return `https://discord.com/channels/${ticket.guildId}/${ticket.id}`;
}
function messageTicketId(client, message, guildId) {
	if (message.author?.id !== client.user.id) return null;
	for (const row of message.components || []) {
		for (const component of row.components || []) {
			const match = (component.url || component.data?.url)?.match(/^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)$/);
			if (match?.[1] === guildId) return match[2];
		}
	}
	return null;
}
async function findOverview(client, channel, ticket) {
	let before;
	const matches = [];
	do {
		const page = await channel.messages.fetch({
			limit: 100,
			...(before ? { before } : {}),
		});
		for (const message of page.values()) if (messageTicketId(client, message, ticket.guildId) === ticket.id) matches.push(message);
		if (page.size < 100) break;
		before = page.last().id;
	} while (before);
	for (const duplicate of matches.slice(1)) await duplicate.delete();
	return matches[0] || null;
}
function overviewPayload(ticket, getMessage) {
	const state = ticket.guild.automaticTicketStatus === false ? 'ACTIVE' : waitingState(ticket);
	const embed = new EmbedBuilder().setColor(ticket.guild.primaryColour).setTitle(getMessage('ticket.support.overview.title', {
		number: ticket.number,
		category: ticket.category?.name || 'Ticket',
	}).slice(0, 256)).setURL(overviewURL(ticket)).addFields(
		{
			name: getMessage('ticket.support.overview.creator').slice(0, 256),
			value: `<@${ticket.createdById}>`,
			inline: true,
		},
		{
			name: getMessage('ticket.support.overview.assigned').slice(0, 256),
			value: ticket.claimedById ? `<@${ticket.claimedById}>` : getMessage('ticket.support.overview.unassigned').slice(0, 256),
			inline: true,
		},
		{
			name: getMessage('ticket.support.overview.priority').slice(0, 256),
			value: ticket.priority ? `${PRIORITY[ticket.priority]} ${getMessage(`commands.slash.priority.options.priority.choices.${ticket.priority}`)}` : getMessage('ticket.support.overview.no_priority').slice(0, 256),
			inline: true,
		},
		{
			name: getMessage('ticket.support.overview.status').slice(0, 256),
			value: getMessage(`ticket.support.status.${state.toLowerCase()}`).slice(0, 256),
		},
		{
			name: getMessage('ticket.support.overview.activity').slice(0, 256),
			value: `<t:${Math.floor(+(ticket.lastParticipantAt || ticket.createdAt) / 1000)}:R>`,
		},
	);
	const deadline = deadlineField(ticket, getMessage);
	if (deadline) embed.addFields(deadline);
	return {
		allowedMentions: { parse: [] },
		embeds: [embed],
		components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(getMessage('buttons.open_ticket.text')).setURL(overviewURL(ticket)))],
	};
}
const buttonData = component => {
	const data = component.toJSON();
	return [data.type, data.style, data.custom_id || '', data.label || '', data.url || '', data.emoji?.id || '', data.emoji?.name || '', Boolean(data.disabled)];
};
const sameComponents = (a, b) => JSON.stringify(a.map(row => row.components.map(buttonData))) === JSON.stringify(b.map(row => row.components.map(buttonData)));
const embedData = embed => {
	const data = embed.toJSON();
	return [data.title || '', data.url || '', data.color, (data.fields || []).map(field => [field.name, field.value, Boolean(field.inline)])];
};
function queueName(client, ticketId) {
	const names = session(client).names;
	let job = names.get(ticketId);
	if (job?.running) {
		job.dirty = true;
		return;
	}
	if (job?.retryAt > Date.now()) return;
	job ||= { attempts: 0 };
	names.set(ticketId, job);
	job.running = true;
	job.dirty = true;
	job.promise = (async () => {
		do {
			job.dirty = false;
			const fresh = await client.prisma.ticket.findUnique({
				where: { id: ticketId },
				include,
			});
			if (!fresh?.open) break;
			const channel = await client.channels.fetch(ticketId);
			const desired = channelName(fresh);
			if (channel && channel.name !== desired && !(job.appliedDesired === desired && job.appliedName === channel.name)) {
				await channel.setName(desired);
				job.appliedDesired = desired;
				job.appliedName = channel.name;
				job.dirty = true;
			}
			job.attempts = 0;
		} while (job.dirty);
	})().catch(error => {
		if (!gone(error)) client.log.error(error);
		job.retryAt = Date.now() + [1, 5, 15][Math.min(job.attempts++, 2)] * 60000;
	}).finally(() => {
		job.running = false;
	});
}
async function syncOnce(client, ticketId, history) {
	let ticket = await client.prisma.ticket.findUnique({
		where: { id: ticketId },
		include,
	});
	if (!ticket) return;
	if (!ticket.open || ticket.overviewChannelId && ticket.overviewChannelId !== ticket.guild.ticketOverviewChannel) {
		await removeOverview(client, ticket);
		if (!ticket.open) return;
		ticket.overviewChannelId = ticket.overviewMessageId = null;
	}
	let channel;
	try {
		channel = await client.channels.fetch(ticket.id);
	} catch (error) {
		if (error.code !== 10003) throw error;
		await client.tickets.finallyClose(ticket.id, { reason: 'channel deleted' });
		ticket = await client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include,
		});
		if (ticket) await removeOverview(client, ticket);
		return;
	}
	if (!channel) return;
	if (!ticket.channelBaseName) {
		ticket = await client.prisma.ticket.update({
			where: { id: ticket.id },
			data: { channelBaseName: stripManagedPrefix(channel.name, ticket.priority) },
			include,
		});
	}
	if (history) {
		let before, found = false;
		do {
			const page = await channel.messages.fetch({
				limit: 100,
				...(before ? { before } : {}),
			});
			for (const message of page.values()) {
				if (+message.createdAt <= +(ticket.lastParticipantAt || ticket.createdAt)) {
					found = true;
					break;
				}
				if (message.author?.bot || message.system || message.webhookId) continue;
				await recordParticipant(client, ticket.id, message.author.id, message.createdAt, message.id, false);
				found = true;
				break;
			}
			if (page.size < 100 || found) break;
			before = page.last().id;
		} while (before);
		ticket = await client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include,
		});
		if (!ticket?.open) return;
	}
	const getMessage = await getSupportMessages(client, { ticketId });
	const errors = [];
	// Discord can hold a rename in its REST queue; other ticket work stays independent.
	queueName(client, ticketId);
	try {
		const opening = channel.messages.cache?.get(ticket.openingMessageId) || await channel.messages.fetch(ticket.openingMessageId);
		const rows = openingRows(ticket, getMessage);
		// Existing labels keep the texts used when those buttons were sent.
		const previous = (opening?.components || []).flatMap(row => row.components);
		rows[0].setComponents(rows[0].components.map(button => {
			const old = previous.find(component => component.customId === button.data.custom_id || component.data?.custom_id === button.data.custom_id);
			return old ? ButtonBuilder.from(old) : button;
		}));
		if (opening && !sameComponents(opening.components, rows)) await opening.edit({ components: rows });
	} catch (error) {
		if (!gone(error)) errors.push(error);
	}
	try {
		if (ticket.closeRequestMessageId && ticket.closeScheduledAt) {
			const message = channel.messages.cache?.get(ticket.closeRequestMessageId) || await channel.messages.fetch(ticket.closeRequestMessageId);
			const embed = message?.embeds[0];
			if (embed) {
				const data = embed.toJSON(), field = deadlineField(ticket, getMessage);
				if (!data.fields?.some(item => item.name === field.name && item.value === field.value)) {
					data.fields = [...(data.fields || []).filter(item => item.name !== field.name), field].slice(-25);
					const fresh = await client.prisma.ticket.findUnique({ where: { id: ticketId } });
					if (fresh?.open && fresh.closeRequestMessageId === ticket.closeRequestMessageId) await message.edit({ embeds: [data] });
				}
			}
		}
	} catch (error) {
		if (!gone(error)) errors.push(error);
	}
	try {
		if (ticket.guild.ticketOverviewChannel) {
			const overview = await validateOverviewChannel(client, ticket.guildId, ticket.guild.ticketOverviewChannel, ticket.guild.logChannel, ticket.guild.transcriptChannel);
			let message;
			if (ticket.overviewMessageId) {
				try {
					message = await overview.messages.fetch(ticket.overviewMessageId);
				} catch (error) {
					if (!gone(error)) throw error;
				}
			}
			if (!message) message = await findOverview(client, overview, ticket);
			const fresh = await client.prisma.ticket.findUnique({
				where: { id: ticketId },
				include,
			});
			if (fresh?.open && fresh.guild.ticketOverviewChannel === overview.id) {
				const payload = overviewPayload(fresh, getMessage);
				if (message) {
					if (JSON.stringify(message.embeds.map(embedData)) !== JSON.stringify(payload.embeds.map(embedData)) || !sameComponents(message.components, payload.components)) await message.edit(payload);
				} else {
					message = await overview.send(payload);
				}
				await client.prisma.ticket.update({
					where: { id: ticketId },
					data: {
						overviewChannelId: overview.id,
						overviewMessageId: message.id,
					},
				});
			}
		}
	} catch (error) {
		errors.push(error);
	}
	if (errors.length) throw errors[0];
}
function syncTicket(client, ticketId, { history = false } = {}) {
	const state = session(client);
	if (state.jobs.has(ticketId)) {
		state.jobs.get(ticketId).dirty = true;
		state.jobs.get(ticketId).history ||= history;
		return state.jobs.get(ticketId).promise;
	}
	const job = {
		dirty: true,
		history,
		promise: null,
	};
	state.jobs.set(ticketId, job);
	job.promise = (async () => {
		do {
			job.dirty = false;
			const backfill = job.history;
			job.history = false;
			try {
				await syncOnce(client, ticketId, backfill);
				await client.prisma.ticket.updateMany({
					where: { id: ticketId },
					data: {
						presentationAttempts: 0,
						presentationNextAttemptAt: null,
					},
				});
				if (backfill) state.history.add(ticketId);
			} catch (error) {
				client.log.error(error);
				const ticket = await client.prisma.ticket.findUnique({ where: { id: ticketId } });
				if (ticket) {
					await client.prisma.ticket.updateMany({
						where: { id: ticketId },
						data: {
							presentationAttempts: { increment: 1 },
							presentationNextAttemptAt: new Date(Date.now() + [1, 5, 15][Math.min(ticket.presentationAttempts || 0, 2)] * 60000),
						},
					});
				}
			}
		} while (job.dirty);
	})().finally(() => state.jobs.delete(ticketId));
	return job.promise;
}
function requestSync(client, ticketId) {
	const state = session(client);
	if (state.timers.has(ticketId)) return;
	const timer = setTimeout(() => {
		state.timers.delete(ticketId);
		syncTicket(client, ticketId).catch(client.log.error);
	}, 1500);
	timer.unref?.();
	state.timers.set(ticketId, timer);
}
async function recordParticipant(client, ticketId, userId, at = new Date(), messageId = null, refresh = true, attempt = 0) {
	const ticket = await client.prisma.ticket.findUnique({
		where: { id: ticketId },
		include,
	});
	if (!ticket?.open) return;
	const side = await participantSide(client, ticket, userId);
	if (+ticket.lastParticipantAt > +at || +ticket.lastParticipantAt === +at && (!messageId || !ticket.lastParticipantMessageId || BigInt(messageId) <= BigInt(ticket.lastParticipantMessageId))) return;
	const cancel = ticket.closeRequestedAt && +ticket.closeRequestedAt <= +at;
	const result = await client.prisma.ticket.updateMany({
		where: {
			id: ticketId,
			open: true,
			lastParticipantAt: ticket.lastParticipantAt,
			closeRequestedAt: ticket.closeRequestedAt,
		},
		data: {
			lastParticipantAt: at,
			...(side === 'STAFF' ? { aiState: 'human' } : {}),
			lastParticipantSide: side,
			lastParticipantMessageId: messageId,
			lastMessageAt: at,
			...(cancel ? {
				closeRequestedAt: null,
				closeScheduledAt: null,
				closeRequestedById: null,
				closeRequestReason: null,
				closeRequestMessageId: null,
			} : {}),
		},
	});
	if (!result.count && attempt < 3) return recordParticipant(client, ticketId, userId, at, messageId, refresh, attempt + 1);
	if (result.count && cancel && ticket.closeRequestMessageId) {
		try {
			await (await client.channels.fetch(ticketId))?.messages.delete(ticket.closeRequestMessageId);
		} catch (error) {
			if (!gone(error)) client.log.error(error);
		}
	}
	if (refresh && result.count) requestSync(client, ticketId);
}
async function refreshPresentations(client, startup = false) {
	const state = session(client);
	await recoverOverviewEntries(client, startup);
	const tickets = await client.prisma.ticket.findMany({ where: { OR: [{ open: true }, { overviewMessageId: { not: null } }] } });
	// Keep deletion jobs for closed tickets, but respect persistent retry deadlines.
	const due = tickets.filter(ticket => (ticket.open || ticket.overviewMessageId) && (startup || !ticket.presentationNextAttemptAt || +ticket.presentationNextAttemptAt <= Date.now()));
	let cursor = 0;
	await Promise.all(Array.from({ length: Math.min(4, due.length) }, async () => {
		while (cursor < due.length) {
			const ticket = due[cursor++];
			await syncTicket(client, ticket.id, { history: !state.history.has(ticket.id) });
		}
	}));
}
async function recoverOverviewEntries(client, startup) {
	const state = session(client);
	const guilds = await client.prisma.guild.findMany({ where: { ticketOverviewChannel: { not: null } } });
	for (const guild of guilds) {
		if (!startup && state.recoveredAt.get(guild.id) > Date.now()) continue;
		try {
			const channel = await validateOverviewChannel(client, guild.id, guild.ticketOverviewChannel, guild.logChannel, guild.transcriptChannel);
			const groups = new Map();
			let before;
			do {
				const page = await channel.messages.fetch({
					limit: 100,
					...(before ? { before } : {}),
				});
				for (const message of page.values()) {
					const id = messageTicketId(client, message, guild.id);
					if (!id) continue;
					if (!groups.has(id)) groups.set(id, []);
					groups.get(id).push(message);
				}
				if (page.size < 100) break;
				before = page.last().id;
			} while (before);
			for (const [id, messages] of groups) {
				const ticket = await client.prisma.ticket.findUnique({ where: { id } });
				if (!ticket || ticket.guildId !== guild.id) continue;
				// Preserve the previous channel's durable deletion job during a settings change.
				if (ticket.overviewMessageId && ticket.overviewChannelId !== channel.id) continue;
				const keep = messages.find(message => message.id === ticket.overviewMessageId) || messages[0];
				await client.prisma.ticket.update({
					where: { id },
					data: {
						overviewChannelId: channel.id,
						overviewMessageId: keep.id,
					},
				});
				for (const duplicate of messages.filter(message => message !== keep)) await duplicate.delete();
			}
			state.recoveredAt.set(guild.id, Date.now() + 10 * 60000);
		} catch (error) {
			client.log.error(error);
			state.recoveredAt.set(guild.id, Date.now() + 60000);
		}
	}
}
async function stopPresentations(client) {
	const state = session(client);
	for (const timer of state.timers.values()) clearTimeout(timer);
	state.timers.clear();
	await Promise.all([...state.jobs.values()].map(job => job.promise));
	await Promise.all([...state.names.values()].map(job => job.promise));
	sessions.delete(client);
}
module.exports = {
	WAIT_MS,
	PRIORITY,
	WAIT_EMOJI,
	channelName,
	deadlineField,
	include,
	isCategoryStaff,
	openingRows,
	overviewPayload,
	participantSide,
	recordParticipant,
	refreshPresentations,
	requestSync,
	stripManagedPrefix,
	stopPresentations,
	syncTicket,
	validateOverviewChannel,
	waitingState,
};
