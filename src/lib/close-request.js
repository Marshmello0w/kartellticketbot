const { isCategoryStaff } = require('./ticket-presentation');

async function closeRequestError(client, ticket, interaction, requestId) {
	if (!ticket?.open || ticket.deleted || ticket.channelDeletePending) return 'ticket.close.already_closed';
	if (ticket.guildId !== (interaction.guildId || interaction.guild?.id)) return 'ticket.close.forbidden.description';
	if (!requestId || !ticket.closeRequestedAt || !ticket.closeRequestedById || ticket.closeRequestMessageId !== requestId) return 'ticket.close.request_expired';
	if (ticket.closeRequestedById === ticket.createdById) {
		const staff = interaction.user.id !== ticket.createdById && await isCategoryStaff(client, interaction.guild, ticket.category, interaction.user.id);
		return staff ? null : 'ticket.close.wait_for_staff';
	}
	return interaction.user.id === ticket.createdById ? null : 'ticket.close.wait_for_user';
}

module.exports = { closeRequestError };
