const { recordParticipant } = require('../lib/ticket-presentation');
const { getSupportMessages } = require('../lib/support-texts');
const { Button } = require('@eartharoid/dbf');
const ExtendedEmbedBuilder = require('../lib/embed');
const { MessageFlags } = require('discord.js');
const { closeRequestError } = require('../lib/close-request');

module.exports = class CloseButton extends Button {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'close',
		});
	}

	/**
	 * @param {*} id
	 * @param {import("discord.js").ButtonInteraction} interaction
	 */
	async run(id, interaction) {
		/** @type {import("client")} */
		const client = this.client;

		if (id.accepted === undefined) {
			// the close button on the opening message, the same as using /close
			await client.tickets.beforeRequestClose(interaction);
		} else {
			const ticket = await client.tickets.getTicket(interaction.channel.id, true); // true to override cache and load new feedback
			const requestId = interaction.message?.id;
			const getMessage = await getSupportMessages(client, {
				ticketId: interaction.channel.id,
				guildId: interaction.guildId || interaction.guild?.id,
			});
			const error = await closeRequestError(client, ticket, interaction, requestId);
			if (error) {
				return interaction.reply({
					content: getMessage(error),
					flags: MessageFlags.Ephemeral,
				});
			}
			if (id.accepted) {
				if (
					ticket.createdById === interaction.user.id &&
						ticket.category.enableFeedback &&
						!ticket.feedback
				) {
					return await interaction.showModal(await client.tickets.buildFeedbackModal(ticket, {
						next: 'acceptClose',
						request: requestId,
					}));
				} else {
					await interaction.deferReply();
					await client.tickets.acceptClose(interaction, requestId);
				}
			} else {
				try {
					await interaction.update({
						components: [],
						embeds: [
							new ExtendedEmbedBuilder({
								iconURL: interaction.guild.iconURL(),
								text: ticket.guild.footer,
							})
								.setColor(ticket.guild.errorColour)
								.setDescription(getMessage('ticket.close.rejected', { user: interaction.user.toString() }))
								.setFooter({ text: null }),
						],
					});

				} finally { // this should run regardless of whatever happens above
					if (await client.tickets.cancelClose(ticket.id, requestId)) await recordParticipant(client, ticket.id, interaction.user.id, interaction.createdAt || new Date());
				}
			}
		}
	}
};
