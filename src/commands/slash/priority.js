const { performAction } = require('../../lib/ticket-actions');
const { getSupportMessages } = require('../../lib/support-texts');
const { SlashCommand } = require('@eartharoid/dbf');
const { ApplicationCommandOptionType } = require('discord.js');

const getEmoji = priority => {
	const emojis = {
		'HIGH': '🔴',
		'MEDIUM': '🟠',
		'LOW': '🟢', // eslint-disable-line sort-keys
	};
	return emojis[priority];
};

module.exports = class PrioritySlashCommand extends SlashCommand {
	constructor(client, options) {
		const name = 'priority';
		super(client, {
			...options,
			description: client.i18n.getMessage(null, `commands.slash.${name}.description`),
			descriptionLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.description`),
			dmPermission: false,
			name,
			nameLocalizations: client.i18n.getAllMessages(`commands.slash.${name}.name`),
			options: [
				{
					choices: ['HIGH', 'MEDIUM', 'LOW'],
					name: 'priority',
					required: true,
					type: ApplicationCommandOptionType.String,
				},
			].map(option => {
				option.descriptionLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.description`);
				option.description = option.descriptionLocalizations['en-GB'];
				option.nameLocalizations = client.i18n.getAllMessages(`commands.slash.${name}.options.${option.name}.name`);
				if (option.choices) {
					option.choices = option.choices.map(choice => ({
						name: client.i18n.getMessage(null, `commands.slash.priority.options.${option.name}.choices.${choice}`),
						nameLocalizations: client.i18n.getAllMessages(`commands.slash.priority.options.${option.name}.choices.${choice}`),
						value: choice,
					}));
				}
				return option;
			}),
		});
	}

	/**
	 *
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
				action: 'priority',
				value: interaction.options.getString('priority', true),
			});
			await interaction.editReply({ content: getMessage('ticket.support.saved') });
		} catch (error) {
			if (!error.supportKey) this.client.log.error(error);
			await interaction.editReply({ content: getMessage(error.supportKey || 'ticket.support.errors.failed') });
		}
	}
};

module.exports.getEmoji = getEmoji;
