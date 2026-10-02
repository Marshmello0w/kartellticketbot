const { getSupportMessages } = require('./support-texts');
const { getCommandCache } = require('./commands');
const { isStaff } = require('./users');
const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require('discord.js');
const ExtendedEmbedBuilder = require('./embed');

module.exports = async function handleStaleTickets(client, staleInterval) {
	client.log.info.cron('Handling stale tickets');
	const guilds = await client.prisma.guild.findMany({
		include: {
			tickets: {
				include: { category: true },
				where: { open: true },
			},
		},
		where: {
			OR: [
				{ staleAfter: { not: null } },
				{
					tickets: {
						some: {
							open: true,
							closeRequestedAt: { not: null },
						},
					},
				},
			],
		},
	});
	let processed = 0;
	let closed = 0;
	let marked = 0;

	for (const guild of guilds) {
		const closeCommand = getCommandCache(client, guild.id).find(c => c.name === 'close');
		for (const ticket of guild.tickets) {
			try {
				processed++;
				const getMessage = await getSupportMessages(client, {
					guildId: guild.id,
					categoryId: ticket.categoryId,
				});
				if (ticket.closeRequestedAt) {
					if (!ticket.closeScheduledAt) continue;
					const closeAt = ticket.closeScheduledAt.getTime();
					const halfway = ticket.closeRequestedAt.getTime() + (closeAt - ticket.closeRequestedAt.getTime()) / 2;
					if (Date.now() >= closeAt) {
						const current = await client.prisma.ticket.findUnique({ where: { id: ticket.id } });
						if (!current?.open || current.closeScheduledAt?.getTime() !== closeAt) continue;
						try {
							await client.channels.fetch(ticket.id);
						} catch (error) {
							if (error.code !== 10003) throw error; // Unknown Channel: still finalise the database record.
						}
						await client.tickets.finallyClose(ticket.id, {
							...await client.tickets.getCloseDetails(ticket.id),
							expectedCloseAt: ticket.closeScheduledAt,
						});
						closed++;
					} else if (Date.now() >= halfway && Date.now() < halfway + staleInterval) {
						const channel = await client.channels.fetch(ticket.id);
						if (!channel) continue;
						await channel.send({
							embeds: [
								new ExtendedEmbedBuilder()
									.setColor(guild.primaryColour)
									.setTitle(getMessage('ticket.closing_soon.title'))
									.setDescription(getMessage('ticket.closing_soon.description', { timestamp: Math.floor(closeAt / 1000) })),
							],
						});
					}
				} else if (guild.staleAfter && Date.now() - (ticket.lastMessageAt || ticket.createdAt) >= guild.staleAfter) {
					// set as stale
					/** @type {import("discord.js").TextChannel} */
					const channel = await client.channels.fetch(ticket.id);
					if (!channel) {
						await client.tickets.finallyClose(ticket.id, { reason: 'channel deleted' });
						closed++;
						continue;
					}
					const messages = (await channel.messages.fetch({ limit: 5 })).filter(m => m.author.id !== client.user.id);
					let ping = '';

					if (messages.size > 0) {
						const lastMessage =  messages.first();
						const staff = await isStaff(channel.guild, lastMessage.author.id);
						if (staff) ping = `<@${ticket.createdById}>`;
						else ping = ticket.category.pingRoles.map(r => `<@&${r}>`).join(' ');
					}

					const sent = await channel.send({
						components: [
							new ActionRowBuilder()
								.addComponents(
									new ButtonBuilder()
										.setCustomId(JSON.stringify({ action: 'close' }))
										.setStyle(ButtonStyle.Danger)
										.setEmoji(getMessage('buttons.close.emoji'))
										.setLabel(getMessage('buttons.close.text')),
								),
						],
						content: ping,
						embeds: [
							new ExtendedEmbedBuilder({
								iconURL: channel.guild.iconURL(),
								text: guild.footer,
							})
								.setColor(guild.primaryColour)
								.setTitle(getMessage('ticket.inactive.title'))
								.setDescription(getMessage('ticket.inactive.description', {
									close: closeCommand ? `</${closeCommand.name}:${closeCommand.id}>` : '/close',
									timestamp: Math.floor((ticket.lastMessageAt || ticket.createdAt).getTime() / 1000),
								})),
						],
					});

					await client.tickets.scheduleClose({
						...ticket,
						guild,
					}, sent, null, 'inactivity');
					marked++;
				}
			} catch (error) {
				client.log.error(error);
			}
		}
	}
	client.log.success.cron({
		closed,
		marked,
		processed,
		stale: await client.prisma.ticket.count({
			where: {
				open: true,
				closeRequestedAt: { not: null },
			},
		}),
	});
};