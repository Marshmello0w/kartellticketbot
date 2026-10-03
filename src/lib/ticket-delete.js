const { MessageFlags } = require('discord.js');
const { getSupportMessages } = require('./support-texts');
const {
	requestDelete, finishCloseChannel,
} = require('./ticket-close-channel');

async function runDelete(client, interaction, ticketId = interaction.channelId) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const getMessage = await getSupportMessages(client, {
		guildId: interaction.guildId,
		ticketId,
	});
	try {
		await requestDelete(client, {
			guildId: interaction.guildId,
			ticketId,
			actorId: interaction.user.id,
		});
		await interaction.editReply({
			content: getMessage('ticket.delete.queued'),
			allowedMentions: { parse: [] },
		});
		await finishCloseChannel(client, ticketId);
	} catch (error) {
		if (!error.deleteCode) client.log.error(error);
		await interaction.editReply({
			content: getMessage('ticket.delete.' + (error.deleteCode || 'failed')),
			allowedMentions: { parse: [] },
		});
	}
}
module.exports = { runDelete };
