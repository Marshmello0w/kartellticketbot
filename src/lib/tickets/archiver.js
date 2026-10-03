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
		this.queues = new Map();
	}

	/** Add or update a message
	 * @param {string} ticketId
	 * @param {import("discord.js").Message} message
	 * @param {boolean?} external
	 * @returns {import("@prisma/client").ArchivedMessage|boolean}
	 */
	saveMessage(ticketId, message, external = false) {
		// Gateway events, Drive reconciliation and final capture can all overlap.
		// Serialize per ticket so shared roles/users and edits keep their order.
		const previous = this.queues.get(ticketId) || Promise.resolve();
		const promise = previous.catch(() => {}).then(() => this.saveMessageNow(ticketId, message, external));
		this.queues.set(ticketId, promise);
		if (!this.pending.has(ticketId)) this.pending.set(ticketId, new Set());
		this.pending.get(ticketId).add(promise);
		promise.finally(() => {
			const entries = this.pending.get(ticketId);
			entries?.delete(promise);
			if (!entries?.size) this.pending.delete(ticketId);
			if (this.queues.get(ticketId) === promise) this.queues.delete(ticketId);
		}).catch(() => {});
		return promise;
	}

	async flush(ticketId) {
		while (this.pending.get(ticketId)?.size) await Promise.allSettled([...this.pending.get(ticketId)]);
	}

	async prepareClose(ticketId) {
		if (process.env.OVERRIDE_ARCHIVE === 'false') return true;
		const ticket = await this.client.prisma.ticket.findUnique({
			where: { id: ticketId },
			include: { guild: true },
		});
		if (!ticket?.guild.archive) return true;
		let captured = true;
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
					for (const message of messages.values()) if (await this.saveMessage(ticketId, message) === false) captured = false;
					if (messages.size < 100) break;
					const next = messages.last().id;
					if (next === before) break;
					before = next;
				}
			} else {
				captured = false;
			}
		} catch (error) {
			captured = false;
			this.client.log.warn('Ticket %s: final message sync failed (%s)', ticketId, error.code || error.name);
		}
		await this.flush(ticketId);
		if (ticket.guild.driveArchiveEnabled) {
			await stageTicketAssets(this.client, ticketId).catch(error => {
				captured = false;
				this.client.log.warn('Ticket %s: final attachment backup failed (%s)', ticketId, error.code || error.name);
			});
		}
		return captured;
	}

	async saveMessageNow(ticketId, message, external = false) {
		if (process.env.OVERRIDE_ARCHIVE === 'false') return false;
		const state = await this.client.prisma.ticket.findUnique({ where: { id: ticketId } });
		// Keep the support conversation at closure, without subsequent staff workspace messages.
		if (state && !state.open && (!state.closeCapturePending || state.closedAt && +message.createdAt > +state.closedAt)) return true;

		if (!message.member) {
			try {
				message.member = await message.guild.members.fetch(message.author.id);
			} catch {
				this.client.log.verbose('Failed to fetch member %s of %s', message.author.id, message.guild.id);
			}
		}

		// Different Discord object instances can represent the same database key.
		const channels = new Map([...message.mentions.channels.values()].map(channel => [channel.id, channel]));
		const members = new Map([...message.mentions.members.values()].map(member => [member.user.id, member]));
		const roles = new Map([...message.mentions.roles.values()].map(role => [role.id, role]));

		try {
			const queries = [];

			if (message.member) {
				members.set(message.member.user.id, message.member);
			} else if (message.author) {
				members.set(message.author.id, {
					user: message.author,
					displayName: message.author.globalName || message.author.username,
					guild: message.guild,
					roles: { hoist: null },
				});
			}

			for (const member of members.values()) {
				const role = hoistedRole(member);
				roles.set(role.id, role);
			}

			for (const role of roles.values()) {
				const data = {
					colour: role.hexColor.slice(1),
					name: role.name,
				};
				queries.push(
					() => this.client.prisma.archivedRole.upsert({
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

			for (const member of members.values()) {
				const data = {
					avatar: member.avatar || member.user.avatar, // TODO: save avatar in user/avatars/
					bot: member.user.bot,
					discriminator: member.user.discriminator,
					displayName: member.displayName ? await crypto.queue(w => w.encrypt(member.displayName)) : null,
					roleId: !!member && hoistedRole(member).id,
					username: await crypto.queue(w => w.encrypt(member.user.username)),
				};
				queries.push(
					() => this.client.prisma.archivedUser.upsert({
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

			for (const channel of channels.values()) {
				const data = {
					channelId: channel.id,
					name: channel.name,
					ticketId,
				};
				queries.push(
					() => this.client.prisma.archivedChannel.upsert({
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
				() => this.client.prisma.archivedMessage.upsert({
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

			let result;
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					// Fresh Prisma promises for every attempt. Another bot process
					// may have inserted a shared row after this transaction read it.
					result = await this.client.prisma.$transaction(queries.map(query => query()));
					break;
				} catch (error) {
					if (!['P2002', 'P2034'].includes(error.code) || attempt === 2) throw error;
					await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)));
				}
			}
			if (!external) {
				const ticket = await this.client.prisma.ticket.findUnique({
					where: { id: ticketId },
					include: { guild: true },
				});
				if (ticket) {
					await captureContent(this.client, ticket, content, message.id).catch(error => {
						this.client.log.warn('Drive attachment registration failed for ticket %s', ticketId);
						if (ticket.closeCapturePending) throw error;
					});
				}
			}
			return result;
		} catch (error) {
			this.client.log.error('Failed to archive message %s', message.id);
			this.client.log.error(error);
			return false;
		}
	}
};
