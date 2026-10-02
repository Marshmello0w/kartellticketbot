const { validateTranscriptChannel } = require('../../../../../lib/transcripts');
const {
	validateOverviewChannel, requestSync,
} = require('../../../../../lib/ticket-presentation');
const { logAdminEvent } = require('../../../../../lib/logging.js');
const { Colors } = require('discord.js');

module.exports.get = fastify => ({
	handler: async req => {
		/** @type {import('client')} */
		const client = req.routeOptions.config.client;
		const id = req.params.guild;
		const settings = await client.prisma.guild.findUnique({ where: { id } }) ??
			await client.prisma.guild.create({ data: { id } });

		return settings;
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});

module.exports.patch = fastify => ({
	handler: async req => {
		const data = { ...req.body };
		if (data.transcriptChannel === '') data.transcriptChannel = null;
		if (data.ticketOverviewChannel === '') data.ticketOverviewChannel = null;
		if (Object.hasOwn(data, 'automaticTicketStatus') && typeof data.automaticTicketStatus !== 'boolean') throw Object.assign(new Error('Ungültiger Antwortstatus-Schalter.'), { statusCode: 400 });
		delete data.textOverrides;
		if (Object.prototype.hasOwnProperty.call(data, 'id')) delete data.id;
		if (Object.prototype.hasOwnProperty.call(data, 'createdAt')) delete data.createdAt;
		const colours = ['errorColour', 'primaryColour', 'successColour'];
		for (const c of colours) {
			if (data[c] && !data[c].startsWith('#') && !(data[c] in Colors)) { // if not null/empty and not hex
				throw new Error(`${data[c]} is not a valid colour. Valid colours are HEX and: ${Object.keys(Colors).join(', ')}`);
			}
		}

		/** @type {import('client')} */
		const client = req.routeOptions.config.client;
		const id = req.params.guild;
		const original = await client.prisma.guild.findUnique({ where: { id } });
		if (Object.hasOwn(data, 'driveArchiveEnabled')) {
			if (typeof data.driveArchiveEnabled !== 'boolean') throw Object.assign(new Error('Ungültiger Drive-Schalter.'), { statusCode: 400 });
			if (data.driveArchiveEnabled) {
				if (!(Object.hasOwn(data, 'archive') ? data.archive : original?.archive) || process.env.OVERRIDE_ARCHIVE === 'false') throw Object.assign(new Error('Drive-Archivierung benötigt aktivierte Nachrichtenarchivierung.'), { statusCode: 400 });
				try {
					await require('../../../../../lib/google-drive').getDrive(client).validateRoot();
				} catch {
					throw Object.assign(new Error('Google Drive ist nicht verbunden oder der Archivordner ist nicht privat und beschreibbar.'), { statusCode: 400 });
				}
			}
		}
		if (data.archive === false) data.driveArchiveEnabled = false;
		try {
			await validateOverviewChannel(client, id, Object.hasOwn(data, 'ticketOverviewChannel') ? data.ticketOverviewChannel : original?.ticketOverviewChannel, Object.hasOwn(data, 'logChannel') ? data.logChannel : original?.logChannel, Object.hasOwn(data, 'transcriptChannel') ? data.transcriptChannel : original?.transcriptChannel);
		} catch (error) {
			error.statusCode = 400;
			throw error;
		}
		if (Object.hasOwn(data, 'transcriptChannel') || Object.hasOwn(data, 'logChannel')) {
			const transcriptChannel = Object.hasOwn(data, 'transcriptChannel') ? data.transcriptChannel : original.transcriptChannel;
			try {
				await validateTranscriptChannel(client, id, transcriptChannel, Object.hasOwn(data, 'logChannel') ? data.logChannel : original.logChannel);
			} catch (error) {
				error.statusCode = 400;
				throw error;
			}
		}
		const settings = await client.prisma.guild.update({
			data: data,
			include: { categories: { select: { id: true } } },
			where: { id },
		});

		// Update cached categories, which include guild settings
		for (const { id } of settings.categories) await client.tickets.getCategory(id, true);
		if (data.driveArchiveEnabled) {
			const {
				ensureArchive, tick,
			} = require('../../../../../lib/drive-archive');
			const tickets = await client.prisma.ticket.findMany({
				where: {
					guildId: id,
					open: true,
				},
				include: { guild: true },
			});
			for (const ticket of tickets) await ensureArchive(client, ticket);
			tick(client).catch(() => client.log.warn('Drive archive sync pending'));
		}
		if (['ticketOverviewChannel', 'automaticTicketStatus'].some(key => Object.hasOwn(data, key))) {
			const tickets = await client.prisma.ticket.findMany({
				where: {
					guildId: id,
					OR: [{ open: true }, { overviewMessageId: { not: null } }],
				},
				select: { id: true },
			});
			for (const ticket of tickets) requestSync(client, ticket.id);
		}

		// don't log the categories
		delete settings.categories;

		logAdminEvent(client, {
			action: 'update',
			diff: {
				original,
				updated: settings,
			},
			guildId: id,
			target: {
				id,
				name: client.guilds.cache.get(id).name,
				type: 'settings',
			},
			userId: req.user.id,
		});
		return settings;
	},
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
