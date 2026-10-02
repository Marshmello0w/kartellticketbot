const { pools } = require('../threads');

const { crypto } = pools;
const {
	captureContent, stageTicketAssets,
} = require('../drive-archive');

/**
 * Returns highest (roles.highest) hoisted role, or everyone
 * @param {import("discord.js").GuildMember} member
 * @returns {import("discord.js").Role}
 */
const hoistedRole = member => member.roles.hoist || member.guild.roles.everyone;

module.exports = class TicketArchiver {
	constructor(client) {
		/** @type {import("client")} */
		this.client = client;
		this.pending = new Map();
	}

	/** Add or update a message
	 * @param {string} ticketId
	 * @param {import("discord.js").Message} message
	 * @param {boolean?} external
	 * @returns {import("@prisma/client").ArchivedMessage|boolean}
	 */
	saveMessage(ticketId, message, external = false) {
		const promise = this.saveMessageNow(ticketId, message, external);
		if (!this.pending.has(ticketId)) this.pending.set(ticketId, new Set());
		this.pending.get(ticketId).add(promise);
		promise.finally(() => {
			const entries = this.pending.get(ticketId);
			entries?.delete(promise);
			if (!entries?.size) this.pending.delete(ticketId);
		}).catch(() => {});
		return promise;
	}

	async flush(ticketId) {
		while (this.pending.get(ticketId)?.size) await Promise.allSettled([...this.pending.get(ticketId)]);
	}

	async prepareClose(ticketId) {
		if (process.env.OVERRIDE_ARCHIVE === 'false') return;
		const ticket = await this.client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include: { guild: true },
		});
		if (!ticket?.guild.archive) return;
		try {
			const channel = this.client.channels.cache.get(ticketId) || await this.client.channels.fetch(ticketId);
			if (channel?.id === ticketId) {
				let before;
				while (true) {
					const messages = await channel.messages.fetch({
						limit: 100,
						...(before ? { before } : {}),
						cache: false,
					});
					for (const message of messages.values()) await this.saveMessage(ticketId, message);
					if (messages.size < 100) break;
					const next = messages.last().id;
					if (next === before) break;
					before = next;
				}
			}
		} catch (error) {
			this.client.log.warn('Ticket %s: final message sync failed (%s)', ticketId, error.code || error.name);
		}
		await this.flush(ticketId);
		if (ticket.guild.driveArchiveEnabled) {
			await stageTicketAssets(this.client, ticketId).catch(error => {
				this.client.log.warn('Ticket %s: final attachment backup failed (%s)', ticketId, error.code || error.name);
			});
		}
	}

	async saveMessageNow(ticketId, message, external = false) {
		if (process.env.OVERRIDE_ARCHIVE === 'false') return false;

		if (!message.member) {
			try {
				message.member = await message.guild.members.fetch(message.author.id);
			} catch {
				this.client.log.verbose('Failed to fetch member %s of %s', message.author.id, message.guild.id);
			}
		}

		const channels = new Set(message.mentions.channels.values());
		const members = new Set(message.mentions.members.values());
		const roles = new Set(message.mentions.roles.values());

		try {
			const queries = [];

			if (message.member) {
				members.add(message.member);
			} else if (message.author) {
				members.add({
					user: message.author,
					displayName: message.author.globalName || message.author.username,
					guild: message.guild,
					roles: { hoist: null },
				});
			}

			for (const member of members) {
				roles.add(hoistedRole(member));
			}

			for (const role of roles) {
				const data = {
					colour: role.hexColor.slice(1),
					name: role.name,
				};
				queries.push(
					this.client.prisma.archivedRole.upsert({
						create: {
							...data,
							roleId: role.id,
							ticketId,
						},
						select: { ticketId: true },
						update: data,
						where: {
							ticketId_roleId: {
								roleId: role.id,
								ticketId,
							},
						},
					}),
				);
			}

			for (const member of members) {
				const data = {
					avatar: member.avatar || member.user.avatar, // TODO: save avatar in user/avatars/
					bot: member.user.bot,
					discriminator: member.user.discriminator,
					displayName: member.displayName ? await crypto.queue(w => w.encrypt(member.displayName)) : null,
					roleId: !!member && hoistedRole(member).id,
					username: await crypto.queue(w => w.encrypt(member.user.username)),
				};
				queries.push(
					this.client.prisma.archivedUser.upsert({
						create: {
							...data,
							ticketId,
							userId: member.user.id,
						},
						select: { ticketId: true },
						update: data,
						where: {
							ticketId_userId: {
								ticketId,
								userId: member.user.id,
							},
						},
					}),
				);
			}

			for (const channel of channels) {
				const data = {
					channelId: channel.id,
					name: channel.name,
					ticketId,
				};
				queries.push(
					this.client.prisma.archivedChannel.upsert({
						create: data,
						select: { ticketId: true },
						update: data,
						where: {
							ticketId_channelId: {
								channelId: channel.id,
								ticketId,
							},
						},
					}),
				);
			}

			const content = {
				attachments: [...message.attachments.values()],
				components: [...message.components.values()],
				content: message.content,
				embeds: message.embeds.map(embed => ({ ...embed })),
				reference: message.reference?.messageId ?? null,
				author: {
					username: message.author?.username,
					displayName: message.member?.displayName || message.author?.globalName || message.author?.username,
					userId: message.author?.id,
					avatarUrl: message.member?.displayAvatarURL?.({
						extension: 'png',
						size: 128,
					}) || message.author?.displayAvatarURL?.({
						extension: 'png',
						size: 128,
					}),
					bot: Boolean(message.author?.bot),
					roleId: message.member ? hoistedRole(message.member).id : null,
				},
			};
			const data = {
				content: await crypto.queue(w => w.encrypt(JSON.stringify(content))),
				createdAt: message.createdAt,
				edited: !!message.editedAt,
				external,
			};

			queries.push(
				this.client.prisma.archivedMessage.upsert({
					create: {
						...data,
						authorId: message.author?.id || 'default',
						id: message.id,
						ticketId,
					},
					select: { ticketId: true },
					update: data,
					where: { id: message.id },
				}),
			);

			const result = await this.client.prisma.$transaction(queries);
			if (!external) {
				const ticket = await this.client.prisma.ticket.findUnique({
					where: { id: ticketId },
					include: { guild: true },
				});
				if (ticket) await captureContent(this.client, ticket, content, message.id).catch(() => this.client.log.warn('Drive attachment registration failed for ticket %s', ticketId));
			}
			return result;
		} catch (error) {
			this.client.log.error('Failed to archive message %s', message.id);
			this.client.log.error(error);
			return false;
		}
	}
};
