const { getSupportMessages } = require('../../lib/support-texts');
const { SlashCommand } = require('@eartharoid/dbf');
const {
	ApplicationCommandOptionType,
	EmbedBuilder,
} = require('discord.js');
const { performAction } = require('../../lib/ticket-actions');




module.exports = class TransferSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'transfer';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [
				{
					name: 'member',
					required: true,
					type: ApplicationCommandOptionType.User,
				},
			].map(option => {
				option.descriptionLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.description`);
				option.description = option.descriptionLocalizations['en-GB'];
				option.nameLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.name`);
				return option;
			}),
		});
	}

	/**
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction) {
		await interaction.deferReply({ flags: 64 });
		const getMessage = await getSupportMessages(this.client, {
			ticketId: interaction.channelId,
			guildId: interaction.guildId,
		});
		try {
			const ticket = await this.client.prisma.ticket.findUnique({ where: { id: interaction.channelId } });
			const member = interaction.options.getUser('member', true);
			const updated = await performAction(this.client, {
				guildId: interaction.guildId,
				ticketId: interaction.channelId,
				actorId: interaction.user.id,
				action: 'transfer',
				value: member.id,
			});
			await interaction.editReply({
				embeds: [new EmbedBuilder().setColor(updated.guild.primaryColour).setDescription(getMessage('commands.slash.transfer.transferred' + (interaction.user.id !== ticket.createdById ? '_from' : ''), {
					from: '<@' + ticket.createdById + '>',
					to: '<@' + member.id + '>',
					user: '<@' + interaction.user.id + '>',
				}))],
			});
		} catch (error) {
			if (!error.supportKey) this.client.log.error(error);
			await interaction.editReply({ content: getMessage(error.supportKey || 'ticket.support.errors.failed') });
		}
	}
};
