const { performAction } = require('../../lib/ticket-actions');
const { getSupportMessages } = require('../../lib/support-texts');
const { SlashCommand } = require('@eartharoid/dbf');
const { ApplicationCommandOptionType } = require('discord.js');

module.exports = class RenameSlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'rename';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalisations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalisations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [
				{
					name: 'name',
					required: true,
					type: ApplicationCommandOptionType.String,
				},
			].map(option => {
				option.descriptionLocalisations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.description`);
				option.description = option.descriptionLocalisations['en-GB'];
				option.nameLocalisations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.name`);
				return option;
			}),
		});
	}

	/**
	 * Handle the 'rename' command
	 * @param {import("discord.js").ChatInputCommandInteraction} interaction
	 */
	async run(interaction) {
		await interaction.deferReply({ flags: 64 });
		const getMessage = await getSupportMessages(this.client, {
			ticketId: interaction.channelId,
			guildId: interaction.guildId,
		});
		try {
			await performAction(this.client, {
				guildId: interaction.guildId,
				ticketId: interaction.channelId,
				actorId: interaction.user.id,
				action: 'rename',
				value: interaction.options.getString('name', true),
			});
			await interaction.editReply({ content: getMessage('ticket.support.saved') });
		} catch (error) {
			if (!error.supportKey) this.client.log.error(error);
			await interaction.editReply({ content: getMessage(error.supportKey || 'ticket.support.errors.failed') });
		}
	}
};
