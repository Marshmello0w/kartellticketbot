const {
	AttachmentBuilder, ChannelType, EmbedBuilder, PermissionsBitField,
} = require('discord.js');
const fs = require('fs');
const { join } = require('path');
const Mustache = require('mustache');
const { getSupportMessages } = require('./support-texts');

const transcriptInclude = {
	archivedChannels: true,
	archivedMessages: {
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		where: { external: false },
	},
	archivedRoles: true,
	archivedUsers: true,
	category: true,
	claimedBy: true,
	closedBy: true,
	createdBy: true,
	feedback: true,
	guild: true,
	questionAnswers: { include: { question: true } },
};

async function renderTranscript(client, original, options = {}) {
	const { pools } = require('./threads');
	const ticket = await pools.transcript.queue(worker => worker(original));
	const configured = client.config.templates?.transcript;
	const templateName = options.forceHtml || !configured || ['transcript.md', 'transcript.html'].includes(configured) ? 'transcript.html' : configured;
	const channelName = (ticket.channelBaseName || ticket.category?.channelName || 'ticket-{number}')
		.replace(/{+\s?(user)?name\s?}+/gi, ticket.createdBy?.username || 'user')
		.replace(/{+\s?(nick|display)(name)?\s?}+/gi, ticket.createdBy?.displayName || 'user')
		.replace(/{+\s?num(ber)?\s?}+/gi, ticket.number);
	const formatDate = (date, full) => new Intl.DateTimeFormat([ticket.guild.locale, 'en-GB'], {
		dateStyle: full ? 'full' : 'short',
		timeStyle: full ? 'long' : 'short',
		timeZone: 'Etc/UTC',
	}).format(date);
	// eslint-disable-next-line no-control-regex -- Reject control characters in file names.
	const fileName = `${channelName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.${templateName.split('.').at(-1)}`;
	if (templateName === 'transcript.html') {
		if (!options.assets && client.prisma.driveAsset) {
			const missing = await client.prisma.driveAsset.findMany({
				where: {
					archiveId: original.id,
					OR: [{ state: 'missing' }, { errorCode: 'MISSING' }],
				},
				select: { assetKey: true },
			});
			options = {
				...options,
				missingAssets: new Set(missing.map(asset => asset.assetKey)),
			};
		}
		const { renderHtml } = require('./transcript-html');
		const templatePath = join('./user/templates', 'transcript.html.mustache');
		return {
			fileName,
			transcript: renderHtml(ticket, {
				...options,
				i18n: client.i18n,
				channelName,
				guildName: client.guilds.cache.get(ticket.guildId)?.name,
				templatePath: fs.existsSync?.(templatePath) ? templatePath : undefined,
			}),
		};
	}
	const template = fs.readFileSync(join('./user/templates', templateName + '.mustache'), 'utf8');
	const transcript = Mustache.render(template, {
		channelName,
		ticket,
		guildName: client.guilds.cache.get(ticket.guildId)?.name,
		pinned: ticket.pinnedMessageIds.join(', '),
		closedAtFull() {
			return this.closedAt ? formatDate(this.closedAt, true) : '';
		},
		createdAtFull() {
			return formatDate(this.createdAt, true);
		},
		createdAtTimestamp() {
			return formatDate(this.createdAt, false);
		},
	}, { }, { escape: templateName.endsWith('.html') ? Mustache.escape : text => text });
	return {
		fileName,
		transcript,
	};
}

async function validateTranscriptChannel(client, guildId, channelId, logChannel) {
	if (channelId === null || channelId === '') return null;
	if (!/^\d{17,20}$/.test(channelId || '')) throw new Error('Ungültiger Transkript-Kanal.');
	if (channelId === logChannel) throw new Error('Transkript-Kanal und Log-Kanal müssen verschieden sein.');
	const channel = await client.channels.fetch(channelId);
	if (!channel || channel.guildId !== guildId || channel.type !== ChannelType.GuildText) throw new Error('Bitte einen Textkanal dieses Servers auswählen.');
	const member = channel.guild.members.me || await channel.guild.members.fetchMe();
	const required = ['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'EmbedLinks', 'AttachFiles'];
	const permissions = channel.permissionsFor(member);
	for (const name of required) {
		if (!permissions?.has(PermissionsBitField.Flags[name])) throw new Error(`Im Transkript-Kanal fehlt dem Bot die Berechtigung ${name}.`);
	}
	return channel;
}

const active = new Set();
async function deliverTranscript(client, ticketId) {
	if (active.has(ticketId)) return;
	active.add(ticketId);
	try {
		const ticket = await client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include: transcriptInclude,
		});
		if (!ticket || ticket.open || ticket.closeCapturePending || !ticket.transcriptPending || ticket.transcriptMessageId) return;
		const now = new Date();
		const claim = await client.prisma.ticket.updateMany({
			where: {
				id: ticketId,
				open: false,
				closeCapturePending: false,
				transcriptPending: true,
				transcriptMessageId: null,
				OR: [{ transcriptNextAttemptAt: null }, { transcriptNextAttemptAt: { lte: now } }],
			},
			data: { transcriptNextAttemptAt: new Date(now.getTime() + 300000) },
		});
		if (!claim.count) return;
		try {
			if (!ticket.guild.archive || process.env.OVERRIDE_ARCHIVE === 'false') throw new Error('Nachrichtenarchivierung ist deaktiviert.');
			const channel = await validateTranscriptChannel(client, ticket.guildId, ticket.guild.transcriptChannel, ticket.guild.logChannel);
			if (!channel) throw new Error('Kein Transkript-Kanal eingestellt.');
			// Recover sends which succeeded before a process stopped saving the message ID.
			const recent = await channel.messages.fetch({ limit: 100 });
			let sent = recent.find(message => message.author.id === client.user.id && message.attachments.size && message.embeds.some(embed => embed.footer?.text === ticketId));
			if (!sent) {
				const {
					fileName, transcript,
				} = await renderTranscript(client, ticket);
				const getMessage = await getSupportMessages(client, { ticketId });
				const { pools } = require('./threads');
				const reason = ticket.closedReason ? await pools.crypto.queue(worker => worker.decrypt(ticket.closedReason)) : null;
				const embed = new EmbedBuilder().setColor(ticket.guild.primaryColour)
					.setTitle(getMessage('ticket.transcript.title', { number: ticket.number }))
					.setFooter({ text: ticketId })
					.addFields([
						{
							name: getMessage('dm.closed.fields.ticket'),
							value: `${ticket.category?.name || 'Ticket'} #${ticket.number}`,
						},
						{
							name: getMessage('ticket.transcript.creator'),
							value: `<@${ticket.createdById}>`,
							inline: true,
						},
						{
							name: getMessage('dm.closed.fields.closed.name'),
							value: `<t:${Math.floor(ticket.closedAt.getTime() / 1000)}:f>`,
							inline: true,
						},
						{
							name: getMessage('dm.closed.fields.closed_by'),
							value: ticket.closedById ? `<@${ticket.closedById}>` : getMessage('ticket.transcript.automatic'),
							inline: true,
						},
					]);
				if (reason) {
					embed.addFields({
						name: getMessage('dm.closed.fields.reason'),
						value: reason.slice(0, 1024),
					});
				}
				sent = await channel.send({
					...(ticket.guild.driveArchiveEnabled ? { content: getMessage('ticket.transcript.drive.pending') } : {}),
					embeds: [embed],
					files: [new AttachmentBuilder(Buffer.from(transcript), { name: fileName })],
					allowedMentions: { parse: [] },
					nonce: ticketId,
					enforceNonce: true,
				});
			}
			await client.prisma.ticket.update({
				where: { id: ticketId },
				data: {
					transcriptPending: false,
					transcriptMessageId: sent.id,
					transcriptNextAttemptAt: null,
				},
			});
			if (client.prisma.driveArchive) {
				await client.prisma.driveArchive.updateMany({
					where: {
						id: ticketId,
						state: { notIn: ['deleted', 'deleting'] },
					},
					data: {
						transcriptChannelId: channel.id,
						nextAttemptAt: null,
					},
				});
			}
		} catch (error) {
			const attempts = ticket.transcriptAttempts + 1;
			const delay = attempts === 1 ? 60000 : attempts === 2 ? 300000 : 900000;
			await client.prisma.ticket.update({
				where: { id: ticketId },
				data: {
					transcriptAttempts: attempts,
					transcriptNextAttemptAt: new Date(Date.now() + delay),
				},
			});
			client.log.warn('Transcript delivery for ticket %s failed; retry in %d seconds', ticketId, delay / 1000);
			client.log.error(error);
		}
	} finally {
		active.delete(ticketId);
	}
}

async function deliverPendingTranscripts(client) {
	const tickets = await client.prisma.ticket.findMany({
		where: {
			open: false,
			transcriptPending: true,
			transcriptMessageId: null,
			OR: [{ transcriptNextAttemptAt: null }, { transcriptNextAttemptAt: { lte: new Date() } }],
		},
		orderBy: { closedAt: 'asc' },
		take: 50,
		select: { id: true },
	});
	for (const ticket of tickets) {
		try {
			await deliverTranscript(client, ticket.id);
		} catch (error) {
			client.log.error(error);
		}
	}
}

module.exports = {
	deliverPendingTranscripts,
	deliverTranscript,
	renderTranscript,
	transcriptInclude,
	validateTranscriptChannel,
};
