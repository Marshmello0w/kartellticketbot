const { SlashCommand } = require('@eartharoid/dbf');
const { runDelete } = require('../../lib/ticket-delete');
module.exports = class DeleteCommand extends SlashCommand {
	constructor(client, options) {
		super(client, {
			...options,
			name: 'delete',
			dmPermission: false,
			description: client.i18n.getMessage(null, 'commands.slash.delete.description'),
			descriptionLocalizations: client.i18n.getAllMessages('commands.slash.delete.description'),
		});
	}
	async run(interaction) {
		return runDelete(this.client, interaction);
	}
};
